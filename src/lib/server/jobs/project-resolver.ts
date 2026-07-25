import { execFile } from 'node:child_process';
import { stat } from 'node:fs/promises';
import { dirname } from 'node:path';
import { promisify } from 'node:util';
import { isMissingPath } from './missing-path';

export interface ResolvedProject {
  rootPath: string;
  gitRemoteUrl: string | null;
}

export type CwdProjectResolver = (cwd: string) => Promise<ResolvedProject>;
type GitCommandRunner = (cwd: string, arguments_: string[]) => Promise<string>;

const execFileAsync = promisify(execFile);

export async function literalCwdProjectResolver(
  cwd: string,
): Promise<ResolvedProject> {
  return { rootPath: cwd, gitRemoteUrl: null };
}

export async function resolveGitProject(
  cwd: string,
  runGit: GitCommandRunner = runGitCommand,
): Promise<ResolvedProject> {
  if (!(await isDirectory(cwd))) return literalCwdProjectResolver(cwd);

  let rootPath: string;
  try {
    rootPath = dirname(
      (
        await runGit(cwd, [
          'rev-parse',
          '--path-format=absolute',
          '--git-common-dir',
        ])
      ).trim(),
    );
  } catch (cause) {
    if (isNotGitRepository(cause)) return literalCwdProjectResolver(cwd);
    throw cause;
  }

  const remotes = await runGit(cwd, ['remote']);
  if (!remotes.split(/\r?\n/).includes('origin')) {
    return { rootPath, gitRemoteUrl: null };
  }
  const remoteUrl = await runGit(cwd, ['remote', 'get-url', 'origin']);

  return { rootPath, gitRemoteUrl: remoteUrl.trim() || null };
}

async function isDirectory(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory();
  } catch (cause) {
    if (isMissingPath(cause)) return false;
    throw cause;
  }
}

function isNotGitRepository(cause: unknown): boolean {
  return (
    typeof cause === 'object' &&
    cause !== null &&
    'stderr' in cause &&
    typeof cause.stderr === 'string' &&
    cause.stderr.includes('not a git repository')
  );
}

async function runGitCommand(
  cwd: string,
  arguments_: string[],
): Promise<string> {
  const { stdout } = await execFileAsync('git', ['-C', cwd, ...arguments_], {
    encoding: 'utf8',
    env: { ...process.env, LC_ALL: 'C' },
  });
  return stdout;
}
