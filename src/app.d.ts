// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	namespace App {
		// interface Error {}
		// interface Locals {}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
}

declare module '@lucide/svelte/icons/*' {
	import type { Component } from 'svelte';
	import type { IconProps } from '@lucide/svelte';
	const component: Component<IconProps>;
	export default component;
}

export {};

