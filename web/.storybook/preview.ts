import type { Preview } from '@storybook/sveltekit';
import '../src/lib/design-system/tokens.css';
import './preview.css';

const preview: Preview = {
	parameters: {
		a11y: { test: 'error' },
		controls: { expanded: true },
		layout: 'centered',
		viewport: {
			options: {
				mobile: { name: 'Mobile', styles: { width: '390px', height: '844px' } },
				desktop: { name: 'Desktop', styles: { width: '1440px', height: '900px' } }
			}
		}
	},
	tags: ['autodocs']
};

export default preview;
