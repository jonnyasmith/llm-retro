// Deterministic Storybook fixture data for the Viewer page states.
// Encodes the v1 Signals and a mock Inference layer without persistence.

import type {
	Inference,
	InferenceType,
	Job,
	JobStage,
	Session,
	Theme,
	ToolName
} from '../model/session-types';

const JOBS: Job[] = [
	{
		stage: 'import',
		title: 'Import sessions',
		description: 'Normalise Claude/Codex/pi transcripts → Postgres',
		lastRun: '2h ago',
		status: 'idle'
	},
	{
		stage: 'analysis',
		title: 'Extract signals',
		description: 'Derive the 8 deterministic Signals per session',
		lastRun: '2h ago',
		status: 'idle'
	},
	{
		stage: 'analysis',
		title: 'Infer course-corrections',
		description: 'LLM pass via agent CLI, headless in-container',
		lastRun: 'never',
		status: 'idle'
	},
	{
		stage: 'analysis',
		title: 'Thematic synthesis',
		description: 'Map-reduce over Signals + per-session Inferences',
		lastRun: 'never',
		status: 'idle'
	}
];

const jobsByStage = new Map<JobStage, Job[]>();
for (const job of JOBS) {
	const stageJobs = jobsByStage.get(job.stage) ?? [];
	stageJobs.push(job);
	jobsByStage.set(job.stage, stageJobs);
}

export const JOBS_BY_STAGE = [...jobsByStage.entries()];

let seed = 1337;
function rnd(): number {
	seed = (seed * 1664525 + 1013904223) % 4294967296;
	return seed / 4294967296;
}
function pick<T>(items: readonly T[]): T {
	return items[Math.floor(rnd() * items.length)];
}
function ri(lo: number, hi: number): number {
	return lo + Math.floor(rnd() * (hi - lo + 1));
}

export const TOOLS: readonly ToolName[] = ['claude', 'codex', 'pi'];
const MODELS: Record<ToolName, string[]> = {
	claude: ['claude-opus-4', 'claude-sonnet-4'],
	codex: ['gpt-5-codex', 'o4-mini'],
	pi: ['claude-opus-4', 'gpt-5-codex', 'llama-3.3-70b']
};
const TOOLNAMES = ['read', 'edit', 'bash', 'grep', 'glob', 'write', 'task', 'lsp'];
const TASKS = [
	'refactor auth module',
	'debug latency regression',
	'add ECharts viewer',
	'port config loader',
	'write migration',
	'triage flaky tests',
	'implement job runner',
	'normalise session model',
	'review PR #204',
	'wire Docker socket',
	'extract signals job',
	'fix pgvector index',
	'spec metrics viewer',
	'dictate retro notes'
];

export const NOW = new Date('2026-07-18T18:00:00Z');
function daysAgo(days: number, hourLocal: number): Date {
	const dt = new Date(NOW);
	dt.setUTCDate(dt.getUTCDate() - days);
	dt.setUTCHours(hourLocal, ri(0, 59), 0, 0);
	return dt;
}

function makeSession(i: number): Session {
	const tool = pick(TOOLS);
	const models = MODELS[tool];
	const day = ri(0, 20);
	// start hour skews toward working hours; some afternoon sessions
	const startHour = pick([9, 10, 10, 11, 13, 14, 14, 15, 16, 16, 20, 21]);
	const start = daysAgo(day, startHour);
	const turns = ri(4, 60);
	const durationMin = Math.round(turns * (rnd() * 2.4 + 0.8) + ri(0, 25));
	const kind = rnd() < 0.18 ? 'subagent' : 'root';

	// model mix: primary model + occasional secondary
	const primary = pick(models);
	const secondary = rnd() < 0.4 ? pick(models.filter((m) => m !== primary)) : null;
	const mix: Record<string, number> = {};
	if (secondary) {
		const s = rnd() * 0.4 + 0.15;
		mix[primary] = 1 - s;
		mix[secondary] = s;
	} else {
		mix[primary] = 1;
	}

	// tokens — codex is reconstructed (basis)
	const inTok = ri(20000, 900000);
	const outTok = ri(8000, 220000);
	const cacheTok = ri(0, 1500000);
	const basis = tool === 'codex' ? 'reconstructed' : 'exact';

	// subagents
	const subCount = kind === 'root' ? (rnd() < 0.5 ? ri(1, 6) : 0) : 0;
	const subTokens = subCount ? ri(30000, 400000) * subCount : 0;

	// tool usage
	const tools: Record<string, number> = {};
	const nTools = ri(2, 6);
	for (let t = 0; t < nTools; t++) {
		const n = pick(TOOLNAMES);
		tools[n] = (tools[n] || 0) + ri(1, 40);
	}

	// latency samples: per model-response gap. AFTERNOON slowdown baked into per-token rate.
	const nLat = Math.min(turns, ri(6, 40));
	const latency: Session['latency'] = [];
	let activeMs = 0;
	for (let s = 0; s < nLat; s++) {
		const inst = new Date(start.getTime() + s * ((durationMin * 60000) / nLat));
		const hourLocal = (inst.getUTCHours() + 1) % 24; // Europe/London ~ +1 (DST) mock
		const outT = ri(120, 3800);
		// base rate ms/token, afternoon (13-17) penalty
		let rate = 5.5 + rnd() * 2.5;
		if (hourLocal >= 13 && hourLocal <= 17) rate *= 1.32 + rnd() * 0.25;
		if (hourLocal >= 22 || hourLocal <= 6) rate *= 1.08;
		const ms = Math.round(outT * rate + ri(300, 1500));
		latency.push({ instant: inst, ms, outTokens: outT });
		activeMs += ms;
	}

	return {
		id: 'S' + String(i).padStart(3, '0'),
		title: pick(TASKS),
		tool,
		kind,
		start,
		durationMin,
		turns,
		mix,
		tokens: { in: inTok, out: outTok, cache: cacheTok, basis },
		subagents: { count: subCount, tokens: subTokens },
		tools,
		latency,
		activeMs,
		dominantModel: primary,
		inferences: [],
		dumbZone: null
	};
}

export const ALL: Session[] = Array.from({ length: 64 }, (_, i) => makeSession(i + 1));

// ---------------------------------------------------------------------------
// Mock Inference layer — LLM-derived, non-authoritative, stamped. Per-session:
// course-corrections, input-noise waste, dumb-zone detection. Each Inference
// carries the stored contract the viewer forces concrete: refs back to a
// Turn/Message, an evidence excerpt, confidence, a provenance stamp.
// ---------------------------------------------------------------------------
export const EXTRACTOR_V = '0.4.1';

const CC = [
	{
		s: 'Redirected the model away from rewriting the working parser.',
		e: "no — don't touch the parser, just add the flag"
	},
	{
		s: 'Halted an unrequested refactor of the auth flow.',
		e: "stop, that's not what I asked. revert that."
	},
	{
		s: 'Corrected a wrong assumption about the DB schema.',
		e: 'the column already exists, check the migration'
	},
	{
		s: 'Re-scoped after the model over-engineered the solution.',
		e: 'this is way too much — just the one function'
	},
	{
		s: 'Stopped the model deleting tests it misread as dead.',
		e: 'those tests are used, leave them'
	},
	{
		s: 'Pulled the model back after it invented a config key.',
		e: "that option doesn't exist, read the schema"
	}
];
const NOISE = [
	{
		s: "Dictation garbled 'auth' → 'oath'; model built OAuth for 2 turns.",
		e: 'add oath to teh login page',
		fix: 'add auth to the login page'
	},
	{
		s: "Typo 'delete' → 'dilate' sent it down an image path.",
		e: 'can you dilate the old rows',
		fix: 'can you delete the old rows'
	},
	{
		s: 'Dropped word left the request ambiguous; model guessed wrong.',
		e: 'make it work the the config',
		fix: 'make it read from the config'
	}
];
const DZ =
	'Quality degraded past ~{K}k ctx tokens: re-suggested an edit from 20 turns back, lost track of the file it had changed.';

interface InfSeed {
	s: string;
	e: string;
	fix?: string;
}
function inf(
	type: InferenceType,
	session: Session,
	turn: number,
	obj: InfSeed,
	promptV: string,
	conf: number
): Inference {
	return {
		id: `INF-${session.id}-${type}-${turn}`,
		type,
		sessionId: session.id,
		turnRef: turn,
		messageRef: `${session.id}:M${turn * 2}`,
		summary: obj.s,
		evidence: obj.e,
		correctedTo: obj.fix ?? null,
		confidence: conf,
		authoritative: false,
		provenance: {
			model: session.dominantModel,
			promptVersion: promptV,
			extractorVersion: EXTRACTOR_V,
			ranAt: new Date(NOW.getTime() - ri(1, 40) * 3600000),
			rawResponseRef: `resp://${session.id}/${type}`
		}
	};
}

for (const session of ALL) {
	const infs: Inference[] = [];
	const nCC = rnd() < 0.75 ? ri(1, Math.min(4, Math.ceil(session.turns / 12))) : 0;
	const usedT = new Set<number>();
	for (let k = 0; k < nCC; k++) {
		let t: number;
		do {
			t = ri(2, session.turns);
		} while (usedT.has(t));
		usedT.add(t);
		infs.push(
			inf(
				'course-correction',
				session,
				t,
				CC[ri(0, CC.length - 1)],
				'cc@3',
				+(0.62 + rnd() * 0.34).toFixed(2)
			)
		);
	}
	const nNoise = rnd() < 0.38 ? ri(1, 2) : 0;
	for (let k = 0; k < nNoise; k++) {
		let t: number;
		do {
			t = ri(1, session.turns);
		} while (usedT.has(t));
		usedT.add(t);
		infs.push(
			inf(
				'input-noise',
				session,
				t,
				NOISE[ri(0, NOISE.length - 1)],
				'noise@2',
				+(0.55 + rnd() * 0.34).toFixed(2)
			)
		);
	}
	// dumb-zone DETECTION (per session): degradation point in cumulative ctx tokens, or null
	let dz: Inference | null = null;
	if (session.turns > 22 && rnd() < 0.5) {
		const kTok = ri(34, 128);
		const t = ri(Math.ceil(session.turns * 0.55), session.turns);
		dz = inf(
			'dumb-zone',
			session,
			t,
			{
				s: DZ.replace('{K}', String(kTok)),
				e: 'you already changed that file — see turn ' + (t - 18)
			},
			'dz@2',
			+(0.6 + rnd() * 0.3).toFixed(2)
		);
		dz.degradedAtTokens = kTok * 1000;
		infs.push(dz);
	}
	session.inferences = infs;
	session.dumbZone = dz;
}

// Thematic synthesis — map-reduce over the STRUCTURED layer (Signals +
// Inferences), never raw text.
export const THEMES: Theme[] = [
	{
		id: 'T1',
		title: 'Afternoon sessions cost more correction',
		synthesis:
			'Sessions started 13:00–17:00 average more course-corrections per turn, compounding the per-token latency penalty seen in metrics.',
		match: (s) =>
			(s.start.getUTCHours() + 1) % 24 >= 13 &&
			(s.start.getUTCHours() + 1) % 24 <= 17 &&
			s.inferences.some((i) => i.type === 'course-correction')
	},
	{
		id: 'T2',
		title: 'Long single-loop sessions hit the dumb zone',
		synthesis:
			'Degradation clusters in long, high-turn sessions run as one loop rather than several short ones — a session-shape problem, not a model one.',
		match: (s) => Boolean(s.dumbZone)
	},
	{
		id: 'T3',
		title: 'Dictation noise clusters in quick edits',
		synthesis:
			'Input-noise waste concentrates in short sessions where a garbled prompt goes uncaught for a turn or two before redirection.',
		match: (s) => s.inferences.some((i) => i.type === 'input-noise')
	},
	{
		id: 'T4',
		title: 'Reconstructed-token sessions hide real cost',
		synthesis:
			'Codex sessions (reconstructed token basis) with course-corrections under-report the true spend of getting back on track.',
		match: (s) => s.tokens.basis === 'reconstructed' && s.inferences.length > 0
	}
];

export const THEME_STAMP = {
	model: 'claude-opus-4',
	promptVersion: 'synth@2',
	extractorVersion: EXTRACTOR_V,
	ranAt: new Date(NOW.getTime() - 2 * 3600000),
	rawResponseRef: 'resp://synthesis/latest'
};

export const THEME_TYPE: Record<string, InferenceType> = {
	T1: 'course-correction',
	T2: 'dumb-zone',
	T3: 'input-noise',
	T4: 'course-correction'
};
