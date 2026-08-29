<script lang="ts">
	import { goto } from '$app/navigation';
	import { Button } from '$lib/components/ui/button/index.js';
	import { getSession, signOut } from '$lib/stores/auth.svelte';
	import User from '@lucide/svelte/icons/user';
	import LogOut from '@lucide/svelte/icons/log-out';
	import ShieldAlert from '@lucide/svelte/icons/shield-alert';

	let { children } = $props();

	const user = getSession();

	async function handleLogout() {
		await signOut();
		goto('/login');
	}
</script>

<div class="bg-muted/10 min-h-screen">
	<!-- Navbar -->
	<header class="bg-background sticky top-0 z-10 border-b">
		<div class="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
			<div class="flex items-center gap-2">
				<div class="bg-primary flex size-8 items-center justify-center rounded-md">
					<ShieldAlert class="text-primary-foreground size-5" />
				</div>
				<span class="text-lg font-semibold tracking-tight">Admin Dashboard</span>
			</div>
			<div class="flex items-center gap-4">
				<div class="text-muted-foreground hidden items-center gap-2 text-sm sm:flex">
					<User class="size-4" />
					<span class="font-medium text-foreground">{user?.name}</span>
				</div>
				<Button variant="outline" size="sm" class="gap-2" onclick={handleLogout}>
					<LogOut class="size-4" />
					Sign out
				</Button>
			</div>
		</div>
	</header>

	<!-- Main Content -->
	<main class="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
		{@render children()}
	</main>
</div>
