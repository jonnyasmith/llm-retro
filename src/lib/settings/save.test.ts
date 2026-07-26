import { describe, expect, it } from 'vitest';
import type { SettingsChanges } from './contracts';
import {
  SettingsSave,
  type SaveSettingsChanges,
  type SettingsSaveAttempt,
} from './save.svelte';

const fallbackMessage = 'Unable to save time settings';

/** Stands in for the Settings write path, settled by hand. */
class TestSaveCall {
  readonly posted: SettingsChanges[] = [];
  #settle: {
    resolve: () => void;
    reject: (cause: unknown) => void;
  } | null = null;

  readonly save: SaveSettingsChanges = (changes) => {
    this.posted.push(changes);
    return new Promise<void>((resolve, reject) => {
      this.#settle = { resolve, reject };
    });
  };

  succeed(): void {
    this.#take().resolve();
  }

  fail(cause: unknown): void {
    this.#take().reject(cause);
  }

  #take(): { resolve: () => void; reject: (cause: unknown) => void } {
    const settle = this.#settle;
    if (!settle) throw new Error('No save is in flight');
    this.#settle = null;
    return settle;
  }
}

function createSave(): { save: SettingsSave; call: TestSaveCall } {
  const call = new TestSaveCall();
  return { save: new SettingsSave(call.save, fallbackMessage), call };
}

function attempt(
  overrides: Partial<SettingsSaveAttempt> = {},
): SettingsSaveAttempt {
  return {
    changes: { timezone: 'Europe/London' },
    confirmation: 'Time settings saved.',
    adopt: () => {},
    ...overrides,
  };
}

describe('SettingsSave', () => {
  it('starts with nothing in flight and nothing to report', () => {
    const { save } = createSave();

    expect(save.saving).toBe(false);
    expect(save.error).toBe('');
    expect(save.confirmation).toBe('');
  });

  it('posts the changes it was given', async () => {
    const { save, call } = createSave();

    const settled = save.attempt(
      attempt({ changes: { rawArchiveEnabled: false, rawArchivePath: null } }),
    );
    call.succeed();
    await settled;

    expect(call.posted).toEqual([
      { rawArchiveEnabled: false, rawArchivePath: null },
    ]);
  });

  it('is saving from the moment an attempt begins until it settles', async () => {
    const { save, call } = createSave();

    const settled = save.attempt(attempt());
    expect(save.saving).toBe(true);

    call.succeed();
    await settled;

    expect(save.saving).toBe(false);
    expect(save.confirmation).toBe('Time settings saved.');
  });

  it('takes what the server stored before it confirms the save', async () => {
    const { save, call } = createSave();
    let confirmationWhileAdopting = 'never ran';

    const settled = save.attempt(
      attempt({
        adopt: () => {
          confirmationWhileAdopting = save.confirmation;
        },
      }),
    );
    call.succeed();
    await settled;

    expect(confirmationWhileAdopting).toBe('');
    expect(save.confirmation).toBe('Time settings saved.');
  });

  it("reports the failure's own message", async () => {
    const { save, call } = createSave();

    const settled = save.attempt(attempt());
    call.fail(new Error('Ingestion is running; try again once it finishes'));
    await settled;

    expect(save.error).toBe('Ingestion is running; try again once it finishes');
    expect(save.confirmation).toBe('');
  });

  it('falls back to this form\u2019s wording when the failure says nothing', async () => {
    const { save, call } = createSave();

    const settled = save.attempt(attempt());
    call.fail('a rejection that is not an Error');
    await settled;

    expect(save.error).toBe(fallbackMessage);
  });

  it('falls back rather than showing a blank error', async () => {
    const { save, call } = createSave();

    const settled = save.attempt(attempt());
    call.fail(new Error('   '));
    await settled;

    expect(save.error).toBe(fallbackMessage);
  });

  it('does not take server state when the save fails', async () => {
    const { save, call } = createSave();
    let adopted = false;

    const settled = save.attempt(attempt({ adopt: () => (adopted = true) }));
    call.fail(new Error('Timezone is not recognised'));
    await settled;

    expect(adopted).toBe(false);
  });

  it('leaves the form usable after a failure', async () => {
    const { save, call } = createSave();

    const settled = save.attempt(attempt());
    call.fail(new Error('Timezone is not recognised'));
    await settled;

    expect(save.saving).toBe(false);
  });

  it('clears a stale error before a fresh attempt succeeds', async () => {
    const { save, call } = createSave();
    const failed = save.attempt(attempt());
    call.fail(new Error('Timezone is not recognised'));
    await failed;

    const settled = save.attempt(attempt());
    expect(save.error).toBe('');

    call.succeed();
    await settled;

    expect(save.error).toBe('');
    expect(save.confirmation).toBe('Time settings saved.');
  });

  it('clears a stale confirmation before a fresh attempt fails', async () => {
    const { save, call } = createSave();
    const succeeded = save.attempt(attempt());
    call.succeed();
    await succeeded;

    const settled = save.attempt(attempt());
    expect(save.confirmation).toBe('');

    call.fail(new Error('Timezone is not recognised'));
    await settled;

    expect(save.confirmation).toBe('');
    expect(save.error).toBe('Timezone is not recognised');
  });
});
