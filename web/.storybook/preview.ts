import type { Preview } from '@storybook/sveltekit';
import { initialize, mswLoader } from 'msw-storybook-addon';
import { handlers } from '../src/lib/mocks/handlers';
import '../src/lib/design-system/tokens.css';
import './preview.css';

// One mock network for every story; a story overrides it via `parameters.msw`.
initialize({ onUnhandledRequest: 'bypass' }, handlers);

const preview: Preview = {
	loaders: [mswLoader],
	parameters: {
		a11y: { test: 'error' },
		controls: { expanded: true },
		layout: 'centered',
		msw: { handlers },
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
