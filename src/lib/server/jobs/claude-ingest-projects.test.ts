import { mkdir, realpath } from 'node:fs/promises';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { interactions, projects, sessions } from '../database/schema';
import { createClaudeIngestHandler } from './claude-ingest';
import {
  cleanupClaudeIngestFixtures,
  createClaudeIngestFixture as createFixture,
  initialiseGitProject,
  writeJsonLines,
} from './claude-ingest-fixture';

afterEach(cleanupClaudeIngestFixtures);

describe('Claude ingest Project attribution', () => {
  it('uses the real resolver for Session and Interaction opening cwds', async () => {
    const fixture = await createFixture();
    const sessionProjectRoot = join(fixture.logSource, 'session-project');
    const interactionProjectRoot = join(
      fixture.logSource,
      'interaction-project',
    );
    const sessionCwd = join(sessionProjectRoot, 'session-subdirectory');
    const interactionCwd = join(
      interactionProjectRoot,
      'interaction-subdirectory',
    );
    const remote = 'git@example.com:owner/interaction.git';
    await initialiseGitProject(sessionProjectRoot);
    await initialiseGitProject(interactionProjectRoot, remote);
    await mkdir(sessionCwd, { recursive: true });
    await mkdir(interactionCwd, { recursive: true });
    const resolvedSessionProjectRoot = await realpath(sessionProjectRoot);
    const resolvedInteractionProjectRoot = await realpath(
      interactionProjectRoot,
    );
    fixture.database
      .insert(projects)
      .values({ rootPath: resolvedInteractionProjectRoot, gitRemoteUrl: null })
      .run();
    const sessionId = '33333333-3333-4333-8333-333333333333';
    await writeJsonLines(join(fixture.projectDirectory, `${sessionId}.jsonl`), [
      {
        type: 'system',
        cwd: sessionCwd,
        timestamp: '2025-02-01T10:00:00.000Z',
      },
      {
        type: 'user',
        uuid: 'cross-project-prompt',
        cwd: interactionCwd,
        timestamp: '2025-02-01T10:01:00.000Z',
        message: { content: 'Work elsewhere' },
      },
      {
        type: 'assistant',
        timestamp: '2025-02-01T10:01:01.000Z',
        message: {
          model: 'claude-sonnet-4-6-20260217',
          usage: { output_tokens: 1 },
        },
      },
    ]);

    try {
      await createClaudeIngestHandler().run(null, {
        correlationId: 'correlation-real-resolver',
        database: fixture.database,
        progress: vi.fn(),
        log: vi.fn(),
      });

      const storedProjects = fixture.database.select().from(projects).all();
      const sessionProject = storedProjects.find(
        (project) => project.rootPath === resolvedSessionProjectRoot,
      );
      const interactionProject = storedProjects.find(
        (project) => project.rootPath === resolvedInteractionProjectRoot,
      );
      const storedSession = fixture.database
        .select()
        .from(sessions)
        .where(eq(sessions.stableSessionId, sessionId))
        .get();
      const storedInteraction = fixture.database
        .select()
        .from(interactions)
        .where(eq(interactions.interactionKey, 'cross-project-prompt'))
        .get();

      expect(sessionProject).toMatchObject({ gitRemoteUrl: null });
      expect(interactionProject).toMatchObject({ gitRemoteUrl: remote });
      expect(storedSession?.projectId).toBe(sessionProject?.id);
      expect(storedInteraction?.projectId).toBe(interactionProject?.id);
    } finally {
      fixture.sqlite.close();
    }
  });
});
