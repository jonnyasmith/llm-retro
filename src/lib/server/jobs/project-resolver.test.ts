import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveGitProject } from './project-resolver';

const temporaryDirectories: string[] = [];
const execFileAsync = promisify(execFile);

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('Project resolver', () => {
  it('collapses plain-project subdirectories and linked worktrees', async () => {
    const root = await mkdtemp(join(tmpdir(), 'llm-retro-project-resolver-'));
    temporaryDirectories.push(root);
    const projectRoot = join(root, 'main-project');
    const projectSubdirectory = join(projectRoot, 'packages', 'app');
    const worktreeRoot = join(root, 'linked-worktree');
    const worktreeSubdirectory = join(worktreeRoot, 'src');
    const remote = 'git@example.com:owner/project.git';
    await mkdir(projectSubdirectory, { recursive: true });
    await execFileAsync('git', ['init', projectRoot]);
    await execFileAsync('git', [
      '-C',
      projectRoot,
      '-c',
      'user.name=LLM Retro Tests',
      '-c',
      'user.email=tests@llm-retro.invalid',
      'commit',
      '--allow-empty',
      '-m',
      'Initial commit',
    ]);
    await execFileAsync('git', [
      '-C',
      projectRoot,
      'remote',
      'add',
      'origin',
      remote,
    ]);
    await execFileAsync('git', [
      '-C',
      projectRoot,
      'worktree',
      'add',
      '-b',
      'test-worktree',
      worktreeRoot,
    ]);
    await mkdir(worktreeSubdirectory, { recursive: true });
    const resolvedProjectRoot = await realpath(projectRoot);

    await expect(resolveGitProject(projectSubdirectory)).resolves.toEqual({
      rootPath: resolvedProjectRoot,
      gitRemoteUrl: remote,
    });
    await expect(resolveGitProject(worktreeSubdirectory)).resolves.toEqual({
      rootPath: resolvedProjectRoot,
      gitRemoteUrl: remote,
    });
  });

  it('keeps an unresolvable cwd as a literal Project path', async () => {
    const root = await mkdtemp(join(tmpdir(), 'llm-retro-project-resolver-'));
    temporaryDirectories.push(root);
    const nonGitProject = join(root, 'non-git-project');
    const missingProject = join(root, 'deleted-project');
    await mkdir(nonGitProject);

    await expect(resolveGitProject(nonGitProject)).resolves.toEqual({
      rootPath: nonGitProject,
      gitRemoteUrl: null,
    });

    await expect(resolveGitProject(missingProject)).resolves.toEqual({
      rootPath: missingProject,
      gitRemoteUrl: null,
    });
  });

  it('propagates a Git execution failure instead of persisting a fallback', async () => {
    const root = await mkdtemp(join(tmpdir(), 'llm-retro-project-resolver-'));
    temporaryDirectories.push(root);
    const failure = Object.assign(new Error('Git is unavailable'), {
      code: 'ENOENT',
    });
    const runGit = vi.fn().mockRejectedValue(failure);

    await expect(resolveGitProject(root, runGit)).rejects.toBe(failure);
  });

  it('propagates an origin lookup failure', async () => {
    const root = await mkdtemp(join(tmpdir(), 'llm-retro-project-resolver-'));
    temporaryDirectories.push(root);
    const failure = new Error('Origin lookup failed');
    const runGit = vi
      .fn()
      .mockResolvedValueOnce(`${join(root, '.git')}\n`)
      .mockResolvedValueOnce('origin\n')
      .mockRejectedValueOnce(failure);

    await expect(resolveGitProject(root, runGit)).rejects.toBe(failure);
  });
});
