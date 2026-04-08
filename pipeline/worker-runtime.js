const fs = require('fs');
const path = require('path');
const { Queue } = require('bullmq');
const { spawn } = require('child_process');

function videoTimestamp() {
  const d = new Date();
  return d.getFullYear().toString() +
    String(d.getMonth() + 1).padStart(2, '0') +
    String(d.getDate()).padStart(2, '0') + '_' +
    String(d.getHours()).padStart(2, '0') +
    String(d.getMinutes()).padStart(2, '0') +
    String(d.getSeconds()).padStart(2, '0');
}

function backupIfExists(filePath) {
  if (!fs.existsSync(filePath)) return;
  const dir = path.dirname(filePath);
  const ext = path.extname(filePath);
  const base = path.basename(filePath, ext);
  let v = 1;
  while (fs.existsSync(path.join(dir, `${base}_v${v}${ext}`))) v++;
  fs.renameSync(filePath, path.join(dir, `${base}_v${v}${ext}`));
}

function createLogger(projectRoot) {
  return function log(outputDir, agentName, message) {
    const logDir = path.resolve(projectRoot, outputDir, 'logs');
    fs.mkdirSync(logDir, { recursive: true });
    const logFile = path.join(logDir, `${agentName}.log`);
    const entry = `[${new Date().toISOString()}] ${message}\n`;
    fs.appendFileSync(logFile, entry);
    console.log(`  [${agentName}] ${message.split('\n')[0]}`);
  };
}

function createDependencyWaiter({ queueName, redisConnection, log, projectRoot }) {
  return async function waitForDependencies(job) {
    const deps = job.data.dependencies || [];
    if (deps.length === 0) return;

    const outputDir = job.data.output_dir;
    const queue = new Queue(queueName, { connection: redisConnection });
    log(outputDir, job.data.agent, `Waiting for dependencies: ${deps.join(', ')}`);

    // Resolve log dir for file-based dep checking (survives queue obliteration)
    const absLogDir = projectRoot ? path.resolve(projectRoot, outputDir, 'logs') : null;

    function depDoneViaLog(dep) {
      if (!absLogDir) return false;
      const logFile = path.join(absLogDir, `${dep}.log`);
      if (!fs.existsSync(logFile)) return false;
      return fs.readFileSync(logFile, 'utf-8').includes('Completed successfully');
    }

    function depFailedViaLog(dep) {
      if (!absLogDir) return false;
      const logFile = path.join(absLogDir, `${dep}.log`);
      if (!fs.existsSync(logFile)) return false;
      const content = fs.readFileSync(logFile, 'utf-8');
      return content.includes('FAILED:') || content.includes('Claude CLI failed');
    }

    function campaignCancelled() {
      if (!projectRoot) return false;
      const archivedFile = path.resolve(projectRoot, outputDir, 'archived.json');
      return fs.existsSync(archivedFile);
    }

    const maxWait = 3600000;
    const pollInterval = 5000;
    const start = Date.now();

    while (Date.now() - start < maxWait) {
      // Fast-fail if campaign was cancelled/archived
      if (campaignCancelled()) {
        await queue.close();
        throw new Error(`Campaign cancelled — aborting ${job.data.agent}`);
      }

      // Check log files first (survives queue obliteration)
      const logCompleted = deps.filter(dep => depDoneViaLog(dep));
      const logFailed = deps.filter(dep => depFailedViaLog(dep));

      if (logFailed.length > 0) {
        await queue.close();
        throw new Error(`Dependency failed (log) for ${job.data.agent}: ${logFailed.join(', ')}`);
      }

      if (logCompleted.length === deps.length) {
        log(outputDir, job.data.agent, 'All dependencies completed (via log files).');
        await queue.close();
        return;
      }

      // Also check BullMQ completed list for any not yet confirmed via logs
      const remaining = deps.filter(dep => !logCompleted.includes(dep));
      const completed = await queue.getCompleted(0, 1000);
      const completedAgents = completed.filter(j => j.data.output_dir === outputDir).map(j => j.data.agent);

      if (remaining.every(dep => completedAgents.includes(dep))) {
        log(outputDir, job.data.agent, 'All dependencies completed (via queue).');
        await queue.close();
        return;
      }

      const failed = await queue.getFailed(0, 1000);
      const failedAgents = failed.filter(j => j.data.output_dir === outputDir).map(j => j.data.agent);
      if (remaining.some(dep => failedAgents.includes(dep))) {
        await queue.close();
        throw new Error(`Dependency failed (queue) for ${job.data.agent}: ${remaining.filter(d => failedAgents.includes(d)).join(', ')}`);
      }

      const elapsed = Math.round((Date.now() - start) / 1000);
      if (elapsed % 30 < pollInterval / 1000) {
        const waiting = remaining.filter(dep => !completedAgents.includes(dep));
        log(outputDir, job.data.agent, `Still waiting for: ${waiting.join(', ')} (${elapsed}s elapsed)`);
      }

      await new Promise(resolve => setTimeout(resolve, pollInterval));
    }

    await queue.close();
    throw new Error(`Timeout waiting for dependencies: ${deps.join(', ')}`);
  };
}

function createClaudeRunner({ projectRoot, log, command = 'claude' }) {
  return function runClaude(prompt, agentName, outputDir, timeoutMs = 600000, { model = 'sonnet' } = {}) {
    return new Promise((resolve, reject) => {
      const child = spawn(command, [
        '-p', prompt,
        '--dangerously-skip-permissions',
        '--model', model,
        '--no-session-persistence',
      ], {
        cwd: projectRoot,
        env: { ...process.env },
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      let stdout = '';
      let stderr = '';
      log(outputDir, agentName, 'Invoking Claude CLI...');

      child.stdout.on('data', data => { stdout += data.toString(); });
      child.stderr.on('data', data => { stderr += data.toString(); });

      const timer = setTimeout(() => {
        child.kill('SIGTERM');
        reject(new Error(`Claude CLI timed out for ${agentName} after ${timeoutMs}ms`));
      }, timeoutMs);

      child.on('close', (code) => {
        clearTimeout(timer);
        if (stdout) log(outputDir, agentName, `Claude output:\n${stdout}`);
        if (stderr) log(outputDir, agentName, `Claude stderr:\n${stderr}`);

        if (code !== 0) {
          log(outputDir, agentName, `Claude CLI exited with code ${code}`);
          reject(new Error(`Claude CLI failed for ${agentName} (exit code ${code})`));
          return;
        }

        resolve(stdout);
      });

      child.on('error', (err) => {
        clearTimeout(timer);
        log(outputDir, agentName, `Claude CLI spawn error: ${err.message}`);
        reject(new Error(`Claude CLI spawn failed for ${agentName}: ${err.message}`));
      });
    });
  };
}

module.exports = {
  videoTimestamp,
  backupIfExists,
  createLogger,
  createDependencyWaiter,
  createClaudeRunner,
};
