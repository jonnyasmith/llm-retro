import React, { useCallback, useEffect, useRef, useState } from 'react';
import { addons, types, useStorybookApi } from 'storybook/manager-api';

const ADDON_ID = 'llm-retro/visual-tests';
const PANEL_ID = `${ADDON_ID}/panel`;

type Status = 'unchanged' | 'new' | 'changed' | 'error';
type Story = {
	storyId: string;
	name: string;
	file: string;
	status: Status;
	reference: string;
	diff: string;
};
type Manifest = {
	ranAt: string;
	platform: string;
	browser: string;
	summary: Partial<Record<Status, number>>;
	stories: Story[];
};
type ResultsResponse = { running: boolean; lastExit: number | null; results: Manifest | null };

const STATUS: Record<Status, { label: string; color: string }> = {
	unchanged: { label: 'No change', color: '#66BF3C' },
	new: { label: 'New', color: '#0074E8' },
	changed: { label: 'Changed', color: '#FC521F' },
	error: { label: 'Error', color: '#E12128' }
};

const img = (p: string) => `/__visual/image?path=${encodeURIComponent(p)}`;

function Dot({ status }: { status: Status }) {
	return (
		<span
			style={{
				width: 8,
				height: 8,
				borderRadius: 8,
				background: STATUS[status].color,
				display: 'inline-block'
			}}
		/>
	);
}

// Baselines can be absent — a story that opted out, or one not yet captured.
function Shot({ path, alt }: { path: string; alt: string }) {
	const [missing, setMissing] = useState(false);
	if (missing) {
		return (
			<div style={{ maxWidth: 360, padding: 24, border: '1px dashed #E6E9ED', color: '#73828C' }}>
				No screenshot
			</div>
		);
	}
	return (
		<img
			src={img(path)}
			alt={alt}
			onError={() => setMissing(true)}
			style={{ maxWidth: 360, border: '1px solid #E6E9ED' }}
		/>
	);
}

function Panel() {
	const api = useStorybookApi();
	const [data, setData] = useState<ResultsResponse | null>(null);
	const [selected, setSelected] = useState<string | null>(null);
	const poll = useRef<ReturnType<typeof setInterval>>();

	const load = useCallback(async () => {
		try {
			const res = await fetch('/__visual/results');
			setData(await res.json());
		} catch {
			setData({ running: false, lastExit: null, results: null });
		}
	}, []);

	useEffect(() => {
		load();
	}, [load]);

	// While a run is in flight, poll until it settles.
	useEffect(() => {
		if (data?.running && !poll.current) {
			poll.current = setInterval(load, 2000);
		} else if (!data?.running && poll.current) {
			clearInterval(poll.current);
			poll.current = undefined;
		}
		return () => {
			if (poll.current) clearInterval(poll.current);
			poll.current = undefined;
		};
	}, [data?.running, load]);

	// Follow the story the user is viewing, like Chromatic does.
	useEffect(() => {
		const current = api.getCurrentStoryData?.();
		if (current?.id) setSelected(current.id);
	}, [api]);

	const runTests = useCallback(async () => {
		await fetch('/__visual/run', { method: 'POST' });
		setData((d) => (d ? { ...d, running: true } : d));
		load();
	}, [load]);

	const manifest = data?.results ?? null;
	const stories = manifest?.stories ?? [];
	const active = stories.find((s) => s.storyId === selected) ?? stories[0] ?? null;
	const changed = (manifest?.summary?.changed ?? 0) + (manifest?.summary?.error ?? 0);
	const headline = !manifest
		? 'No results yet'
		: changed > 0
			? `${changed} change${changed === 1 ? '' : 's'} to review`
			: 'No changes';

	return (
		<div
			style={{
				display: 'flex',
				height: '100%',
				font: '13px/1.4 system-ui, sans-serif',
				color: '#2E3438'
			}}
		>
			<div
				style={{
					width: 260,
					borderRight: '1px solid #E6E9ED',
					display: 'flex',
					flexDirection: 'column'
				}}
			>
				<div style={{ padding: 12, borderBottom: '1px solid #E6E9ED' }}>
					<div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
						<strong>{headline}</strong>
						<button
							onClick={runTests}
							disabled={data?.running}
							style={{
								border: '1px solid #C9CDD0',
								borderRadius: 6,
								padding: '4px 10px',
								background: data?.running ? '#F2F4F6' : '#FFF',
								cursor: data?.running ? 'default' : 'pointer'
							}}
						>
							{data?.running ? 'Running…' : '▶ Run tests'}
						</button>
					</div>
					{manifest && (
						<div style={{ marginTop: 6, color: '#73828C', fontSize: 12 }}>
							{stories.length} stories · {manifest.browser} · {manifest.platform}
						</div>
					)}
				</div>
				<div style={{ overflow: 'auto', flex: 1 }}>
					{stories.map((s) => (
						<button
							key={s.storyId}
							onClick={() => setSelected(s.storyId)}
							style={{
								display: 'flex',
								alignItems: 'center',
								gap: 8,
								width: '100%',
								textAlign: 'left',
								border: 'none',
								borderBottom: '1px solid #F2F4F6',
								padding: '8px 12px',
								background: active?.storyId === s.storyId ? '#F2F9FF' : 'transparent',
								cursor: 'pointer'
							}}
						>
							<Dot status={s.status} />
							<span
								style={{
									flex: 1,
									overflow: 'hidden',
									textOverflow: 'ellipsis',
									whiteSpace: 'nowrap'
								}}
							>
								{s.name}
							</span>
						</button>
					))}
					{!stories.length && (
						<p style={{ padding: 12, color: '#73828C' }}>
							{manifest
								? 'No stories in the last run.'
								: 'Run the visual tests to populate this panel.'}
						</p>
					)}
				</div>
			</div>

			<div style={{ flex: 1, overflow: 'auto', padding: 16 }}>
				{active ? (
					<>
						<div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
							<Dot status={active.status} />
							<strong>{active.name}</strong>
							<span style={{ color: STATUS[active.status].color }}>
								{STATUS[active.status].label}
							</span>
						</div>
						<div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
							<figure style={{ margin: 0 }}>
								<figcaption style={{ color: '#73828C', marginBottom: 4 }}>Baseline</figcaption>
								<Shot path={active.reference} alt="baseline" />
							</figure>
							{(active.status === 'changed' || active.status === 'error') && (
								<figure style={{ margin: 0 }}>
									<figcaption style={{ color: '#73828C', marginBottom: 4 }}>Diff</figcaption>
									<Shot path={active.diff} alt="diff" />
								</figure>
							)}
						</div>
					</>
				) : (
					<p style={{ color: '#73828C' }}>Select a story, or run the visual tests.</p>
				)}
			</div>
		</div>
	);
}

addons.register(ADDON_ID, () => {
	addons.add(PANEL_ID, {
		type: types.PANEL,
		title: 'Visual tests',
		match: ({ viewMode }) => viewMode === 'story',
		render: ({ active }) => (active ? <Panel /> : null)
	});
});
