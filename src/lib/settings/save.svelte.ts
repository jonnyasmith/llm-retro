import type { SettingsChanges } from './contracts';

/**
 * The one effectful step a Settings save needs. Injected rather than imported
 * so a test can drive success, failure and in-flight states with a double.
 */
export type SaveSettingsChanges = (changes: SettingsChanges) => Promise<void>;

export interface SettingsSaveAttempt {
  /** The fields this form posts. The three forms post disjoint sets. */
  readonly changes: SettingsChanges;
  /** Shown once the save has succeeded and the screen has caught up. */
  readonly confirmation: string;
  /**
   * Takes the screen from what the user typed to what the server stored. Runs
   * before the confirmation, so a confirmed save is never showing a value the
   * server rejected.
   */
  readonly adopt: () => void;
}

/**
 * The save lifecycle behind every Settings form: at most one write in flight,
 * the server's message on failure, a confirmation on success, and neither left
 * standing when the next attempt begins.
 *
 * The per-form fallback wording is configuration, not a branch in here.
 */
export class SettingsSave {
  readonly #save: SaveSettingsChanges;
  readonly #fallbackMessage: string;
  #saving = $state(false);
  #error = $state('');
  #confirmation = $state('');

  constructor(save: SaveSettingsChanges, fallbackMessage: string) {
    this.#save = save;
    this.#fallbackMessage = fallbackMessage;
  }

  /** True from the moment an attempt begins until it settles, either way. */
  get saving(): boolean {
    return this.#saving;
  }

  get error(): string {
    return this.#error;
  }

  get confirmation(): string {
    return this.#confirmation;
  }

  async attempt({
    changes,
    confirmation,
    adopt,
  }: SettingsSaveAttempt): Promise<void> {
    this.#saving = true;
    this.#error = '';
    this.#confirmation = '';
    try {
      await this.#save(changes);
      adopt();
      this.#confirmation = confirmation;
    } catch (cause) {
      // A failure with nothing legible to say gets the caller's wording.
      const message = cause instanceof Error ? cause.message.trim() : '';
      this.#error = message || this.#fallbackMessage;
    } finally {
      this.#saving = false;
    }
  }
}
