import { execFileSync } from 'node:child_process';

import { describe, expect, it } from 'vitest';

describe('the default Compose profile', () => {
	it('contains only the long-running db and web services', () => {
		const services = execFileSync(
			'docker',
			[
				'compose',
				'--project-directory',
				'..',
				'--env-file',
				'../.env.example',
				'config',
				'--services'
			],
			{
				cwd: process.cwd(),
				encoding: 'utf8'
			}
		);

		expect(services.trim().split('\n')).toEqual(['db', 'web']);
	});
});
