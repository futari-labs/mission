// All visible copy and destinations. Edit text here.
// Project statements were checked against each repository README on 2026-11-23.
export interface Project {
	id: 'engineering' | 'kensaku';
	number: string;
	title: string;
	category: string;
	line: string;
	detail: readonly string[];
	facts: readonly (readonly [string, string])[];
	repository: string;
}

export const site = {
	wordmark: 'Futari Labs',
	identity: 'Independent AI lab',
	intro: 'An independent lab building useful AI systems.',
	supporting: 'We explore applied AI through products, agent workflows, and the engineering that makes them work.',
	scrollHint: 'Scroll to explore',
	nav: [
		{ chapter: 'lab', label: 'Lab' },
		{ chapter: 'engineering', label: 'Work' },
		{ chapter: 'explore', label: 'Explore' },
	],
	workHeading: 'Selected work',
	projects: [
		{
			id: 'engineering',
			number: '01',
			title: 'Futari Engineering',
			category: 'Agent workflow / Claude Code plugin',
			line: 'An interactive workflow for defining, reviewing, and executing software projects with agents.',
			detail: [
				'Futari Engineering is a Claude Code plugin with two commands. The first runs product discovery, architecture, evaluations, independent review, and task design, and ends with an approval card in the terminal.',
				'The second verifies the approved contract and hands eligible work to pstack, starting with one vertical slice. Every task carries its requirement, evaluation, and scope into the issue, the pull request, and the evidence.',
			],
			facts: [
				['Define', '/futari:bootstrap'],
				['Build and verify', '/futari:execute'],
				['Runs on', 'Claude Code with pstack'],
			],
			repository: 'https://github.com/futari-labs/engineering',
		},
		{
			id: 'kensaku',
			number: '02',
			title: 'Kensaku',
			category: 'Product research / Local web app',
			line: 'Product research with sources, merchant offers, and a simulated checkout.',
			detail: [
				'Kensaku is a local, single-user shopping research chat for the US, Singapore, and Japan. It answers with a short comparison and numbered source citations, then one card per product with offers taken only from direct merchant pages.',
				'Checkout is a sandbox demonstration. It opens a Stripe sandbox session, places no merchant order, and moves no real money.',
			],
			facts: [
				['Markets', 'US, Singapore, Japan'],
				['Research', 'Exa, with cited sources'],
				['Checkout', 'Stripe sandbox only'],
			],
			repository: 'https://github.com/futari-labs/kensaku',
		},
	] satisfies readonly Project[],
	explore: {
		heading: 'Explore further',
		line: 'The work is open. Choose where to go next.',
		previous: 'Previous destination',
		next: 'Next destination',
		links: [
			{ label: 'Futari Labs', note: 'github.com/futari-labs', href: 'https://github.com/futari-labs' },
			{ label: 'Futari Engineering', note: 'github.com/futari-labs/engineering', href: 'https://github.com/futari-labs/engineering' },
			{ label: 'Kensaku', note: 'github.com/futari-labs/kensaku', href: 'https://github.com/futari-labs/kensaku' },
		],
	},
	details: 'View details',
	repository: 'Repository',
	close: 'Close',
	footer: '\u00a9 2026 Futari Labs',
} as const;
