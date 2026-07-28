import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
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
  describe('a cwd inside a Git Project', () => {
    const remote = 'git@example.com:owner/project.git';
    let root: string;
    let projectSubdirectory: string;
    let worktreeSubdirectory: string;
    let resolvedProjectRoot: string;

    // Every rule below only reads the repository, so it is built once for the
    // group rather than paying four Git invocations per test.
    beforeAll(async () => {
      root = await mkdtemp(join(tmpdir(), 'llm-retro-project-resolver-'));
      const projectRoot = join(root, 'main-project');
      const worktreeRoot = join(root, 'linked-worktree');
      projectSubdirectory = join(projectRoot, 'packages', 'app');
      worktreeSubdirectory = join(worktreeRoot, 'src');
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
      resolvedProjectRoot = await realpath(projectRoot);
    });

    afterAll(async () => {
      await rm(root, { recursive: true, force: true });
    });

    it('collapses a subdirectory onto the Project root', async () => {
      const resolved = await resolveGitProject(projectSubdirectory);

      expect(resolved.rootPath).toBe(resolvedProjectRoot);
    });

    it('carries the origin remote URL of the Project', async () => {
      const resolved = await resolveGitProject(projectSubdirectory);

      expect(resolved.gitRemoteUrl).toBe(remote);
    });

    it('collapses a linked worktree onto the Project it was created from', async () => {
      await expect(resolveGitProject(worktreeSubdirectory)).resolves.toEqual(
        await resolveGitProject(projectSubdirectory),
      );
    });
  });

  describe('a cwd inside a Git Project with no usable origin', () => {
    let projectRoot: string;
    let resolvedProjectRoot: string;

    beforeEach(async () => {
      const root = await mkdtemp(join(tmpdir(), 'llm-retro-project-resolver-'));
      temporaryDirectories.push(root);
      projectRoot = join(root, 'remoteless-project');
      await execFileAsync('git', ['init', projectRoot]);
      resolvedProjectRoot = await realpath(projectRoot);
    });

    it('still resolves the Project root', async () => {
      const resolved = await resolveGitProject(projectRoot);

      expect(resolved.rootPath).toBe(resolvedProjectRoot);
    });

    it('leaves the remote URL unset when no origin is configured', async () => {
      const resolved = await resolveGitProject(projectRoot);

      expect(resolved.gitRemoteUrl).toBeNull();
    });

    it('leaves the remote URL unset when the origin has a blank URL', async () => {
      // Git refuses to store an empty remote URL, so the only way to reach the
      // blank-URL branch is through the injected command runner.
      const runGit = vi
        .fn()
        .mockResolvedValueOnce(`${join(projectRoot, '.git')}\n`)
        .mockResolvedValueOnce('origin\n')
        .mockResolvedValueOnce('  \n');

      const resolved = await resolveGitProject(projectRoot, runGit);

      expect(resolved.gitRemoteUrl).toBeNull();
    });
  });

  describe('a cwd that belongs to no Git Project', () => {
    let root: string;

    beforeEach(async () => {
      root = await mkdtemp(join(tmpdir(), 'llm-retro-project-resolver-'));
      temporaryDirectories.push(root);
    });

    it('keeps a directory outside any repository as a literal Project path', async () => {
      const nonGitProject = join(root, 'non-git-project');
      await mkdir(nonGitProject);

      await expect(resolveGitProject(nonGitProject)).resolves.toEqual({
        rootPath: nonGitProject,
        gitRemoteUrl: null,
      });
    });

    it('keeps a path that no longer exists as a literal Project path', async () => {
      const missingProject = join(root, 'deleted-project');

      await expect(resolveGitProject(missingProject)).resolves.toEqual({
        rootPath: missingProject,
        gitRemoteUrl: null,
      });
    });

    it('keeps a path that is not a directory as a literal Project path', async () => {
      const notADirectory = join(root, 'session.jsonl');
      await writeFile(notADirectory, '');

      await expect(resolveGitProject(notADirectory)).resolves.toEqual({
        rootPath: notADirectory,
        gitRemoteUrl: null,
      });
    });
  });

  describe('a cwd whose Git commands fail', () => {
    let root: string;

    beforeEach(async () => {
      root = await mkdtemp(join(tmpdir(), 'llm-retro-project-resolver-'));
      temporaryDirectories.push(root);
    });

    it('propagates a root lookup failure instead of persisting a fallback', async () => {
      const failure = Object.assign(new Error('Git is unavailable'), {
        code: 'ENOENT',
      });
      const runGit = vi.fn().mockRejectedValue(failure);

      await expect(resolveGitProject(root, runGit)).rejects.toBe(failure);
    });

    it('propagates an origin lookup failure', async () => {
      const failure = new Error('Origin lookup failed');
      const runGit = vi
        .fn()
        .mockResolvedValueOnce(`${join(root, '.git')}\n`)
        .mockResolvedValueOnce('origin\n')
        .mockRejectedValueOnce(failure);

      await expect(resolveGitProject(root, runGit)).rejects.toBe(failure);
    });
  });
});
