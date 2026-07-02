import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export interface DockerRunOptions {
  image: string;
  cmd?: string[];
  volumes?: Array<{ host: string; container: string; mode?: string }>;
  env?: Record<string, string>;
  workdir?: string;
  network?: string;
  timeout?: number;
  autoRemove?: boolean;
}

export interface DockerRunResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export async function isDockerAvailable(): Promise<boolean> {
  try {
    await execFileAsync('docker', ['info'], { timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

export async function runDocker(options: DockerRunOptions): Promise<DockerRunResult> {
  const args: string[] = ['run'];

  if (options.autoRemove !== false) {
    args.push('--rm');
  }

  if (options.network) {
    args.push('--network', options.network);
  }

  if (options.workdir) {
    args.push('--workdir', options.workdir);
  }

  if (options.env) {
    for (const [k, v] of Object.entries(options.env)) {
      args.push('-e', `${k}=${v}`);
    }
  }

  if (options.volumes) {
    for (const vol of options.volumes) {
      const mode = vol.mode || 'ro';
      args.push('-v', `${vol.host}:${vol.container}:${mode}`);
    }
  }

  args.push(options.image);

  if (options.cmd) {
    args.push(...options.cmd);
  }

  try {
    const result = await execFileAsync('docker', args, {
      timeout: options.timeout || 300000,
      maxBuffer: 50 * 1024 * 1024,
    });
    return {
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: 0,
    };
  } catch (err: any) {
    return {
      stdout: err.stdout || '',
      stderr: err.stderr || '',
      exitCode: err.code ?? 1,
    };
  }
}
