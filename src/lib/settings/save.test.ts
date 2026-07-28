import { beforeEach, describe, expect, it } from 'vitest';
import type { SettingsChanges } from './contracts';
import {
  SettingsSave,
  type SaveSettingsChanges,
  type SettingsSaveAttempt,
} from './save.svelte';

const fallbackMessage = 'Unable to save time settings';
const changes: SettingsChanges = { timezone: 'Europe/London' };
const confirmation = 'Time settings saved.';
const refusal = 'Ingestion is running; try again once it finishes';

/** Stands in for the Settings write path, settled by hand. */
class TestSaveCall {
  readonly posted: SettingsChanges[] = [];
  #settle: {
    resolve: () => void;
    reject: (cause: unknown) => void;
  } | null = null;

  readonly save: SaveSettingsChanges = (posted) => {
    this.posted.push(posted);
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

function attempt(
  overrides: Partial<SettingsSaveAttempt> = {},
): SettingsSaveAttempt {
  return {
    changes,
    confirmation,
    adopt: () => {},
    ...overrides,
  };
}

describe('SettingsSave', () => {
  let save: SettingsSave;
  let call: TestSaveCall;

  beforeEach(() => {
    call = new TestSaveCall();
    save = new SettingsSave(call.save, fallbackMessage);
  });

  describe('a save with nothing attempted yet', () => {
    it('reports nothing in flight', () => {
      expect(save.saving).toBe(false);
    });

    it('has no failure to report', () => {
      expect(save.error).toBe('');
    });

    it('has nothing to confirm', () => {
      expect(save.confirmation).toBe('');
    });
  });

  describe('a save in flight', () => {
    let settled: Promise<void>;
    let adopted: boolean;
    let confirmationWhileAdopting: string;

    beforeEach(() => {
      adopted = false;
      confirmationWhileAdopting = 'never ran';
      settled = save.attempt(
        attempt({
          adopt: () => {
            adopted = true;
            confirmationWhileAdopting = save.confirmation;
          },
        }),
      );
    });

    it('posts the changes it was given', () => {
      expect(call.posted).toEqual([changes]);
    });

    it('reports itself saving', () => {
      expect(save.saving).toBe(true);
    });

    it.each([
      { cause: 'a rejection that is not an Error' },
      { cause: new Error('') },
      { cause: new Error('   ') },
    ])(
      'falls back to this form\u2019s wording when the failure says nothing',
      async ({ cause }) => {
        call.fail(cause);
        await settled;

        expect(save.error).toBe(fallbackMessage);
      },
    );

    it('trims the wording the failure came with', async () => {
      call.fail(new Error(`  ${refusal}  `));
      await settled;

      expect(save.error).toBe(refusal);
    });

    describe('that the server accepted', () => {
      beforeEach(async () => {
        call.succeed();
        await settled;
      });

      it('takes what the server stored before it confirms the save', () => {
        expect(confirmationWhileAdopting).toBe('');
      });

      it('shows the confirmation the attempt supplied', () => {
        expect(save.confirmation).toBe(confirmation);
      });

      it('has no failure to report', () => {
        expect(save.error).toBe('');
      });

      it('reports nothing in flight', () => {
        expect(save.saving).toBe(false);
      });
    });

    describe('that the server rejected', () => {
      beforeEach(async () => {
        call.fail(new Error(refusal));
        await settled;
      });

      it('reports the failure\u2019s own message', () => {
        expect(save.error).toBe(refusal);
      });

      it('does not take server state the save never reached', () => {
        expect(adopted).toBe(false);
      });

      it('has nothing to confirm', () => {
        expect(save.confirmation).toBe('');
      });

      it('leaves the form usable', () => {
        expect(save.saving).toBe(false);
      });
    });
  });

  describe('a fresh attempt after an accepted save', () => {
    let settled: Promise<void>;

    beforeEach(async () => {
      const accepted = save.attempt(attempt());
      call.succeed();
      await accepted;

      settled = save.attempt(attempt());
    });

    it('clears the stale confirmation before it settles', () => {
      expect(save.confirmation).toBe('');
    });

    it('reports itself saving again', () => {
      expect(save.saving).toBe(true);
    });

    describe('that the server rejected', () => {
      beforeEach(async () => {
        call.fail(new Error(refusal));
        await settled;
      });

      it('leaves no confirmation standing', () => {
        expect(save.confirmation).toBe('');
      });

      it('reports the failure', () => {
        expect(save.error).toBe(refusal);
      });
    });
  });

  describe('a fresh attempt after a rejected save', () => {
    let settled: Promise<void>;

    beforeEach(async () => {
      const rejected = save.attempt(attempt());
      call.fail(new Error('Timezone is not recognised'));
      await rejected;

      settled = save.attempt(attempt());
    });

    it('clears the stale error before it settles', () => {
      expect(save.error).toBe('');
    });

    it('reports itself saving again', () => {
      expect(save.saving).toBe(true);
    });

    describe('that the server accepted', () => {
      beforeEach(async () => {
        call.succeed();
        await settled;
      });

      it('leaves no error standing', () => {
        expect(save.error).toBe('');
      });

      it('confirms the save', () => {
        expect(save.confirmation).toBe(confirmation);
      });
    });
  });
});
