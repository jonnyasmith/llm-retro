import { bootstrap } from '$lib/server/bootstrap';
import {
  IngestionActiveError,
  InvalidSettingsError,
} from '$lib/server/settings/errors';
import { saveSettings } from '$lib/server/settings/save';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
  try {
    return json(await saveSettings(bootstrap.database, request.json()));
  } catch (cause) {
    if (cause instanceof IngestionActiveError) {
      return json({ error: cause.message }, { status: 409 });
    }
    if (cause instanceof InvalidSettingsError) {
      return json({ error: cause.message }, { status: 400 });
    }
    throw cause;
  }
};
