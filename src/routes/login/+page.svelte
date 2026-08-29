<script lang="ts">
	import { goto } from '$app/navigation';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '$lib/components/ui/card/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { signIn } from '$lib/stores/auth.svelte';
	import LoaderCircle from '@lucide/svelte/icons/loader-circle';
	import SchoolIcon from '@lucide/svelte/icons/school';

	let email = $state('');
	let password = $state('');
	let error = $state<string | null>(null);
	let submitting = $state(false);

	async function handleSubmit(event: SubmitEvent) {
		event.preventDefault();
		error = null;

		if (!email.trim()) {
			error = 'Email is required.';
			return;
		}
		// Only @giet.edu emails allowed
		if (!/^[^\s@]+@giet\.edu$/i.test(email.trim())) {
			error = 'Only @giet.edu email addresses are allowed.';
			return;
		}
		if (!password) {
			error = 'Password is required.';
			return;
		}

		submitting = true;
		const result = await signIn(email, password);
		submitting = false;

		if (result.ok) {
			// getSession() is already updated; route guard redirects by role.
			const { getSession } = await import('$lib/stores/auth.svelte');
			const user = getSession();
			const prefix = user?.role === 'admin' ? '/admin' : user?.role === 'student' ? '/student' : '/warden';
			await goto(prefix, { replaceState: true });
		} else {
			error = result.error ?? 'Sign-in failed. Please try again.';
		}
	}
</script>

<svelte:head><title>Sign in · HostelGrievance</title></svelte:head>

<main class="bg-muted/30 flex min-h-screen items-center justify-center p-4">
	<div class="w-full max-w-sm">
		<div class="mb-6 flex flex-col items-center text-center">
			<span
				class="bg-primary text-primary-foreground mb-3 flex size-11 items-center justify-center rounded-lg"
				aria-hidden="true"
			>
				<SchoolIcon class="size-6" />
			</span>
			<h1 class="text-xl font-semibold tracking-tight">HostelGrievance</h1>
			<p class="text-muted-foreground mt-1 text-sm">GIET University · Hostel Administration</p>
		</div>

		<Card>
			<CardHeader>
				<CardTitle>Sign in</CardTitle>
				<CardDescription>Use your GIET University @giet.edu account to continue.</CardDescription>
			</CardHeader>
			<CardContent>
				<form onsubmit={handleSubmit} class="space-y-4" novalidate>
					<div class="space-y-1.5">
						<Label for="email">Email</Label>
						<Input
							id="email"
							type="email"
							autocomplete="username"
							placeholder="your.email@giet.edu"
							bind:value={email}
							disabled={submitting}
							aria-invalid={error ? 'true' : undefined}
						/>
					</div>
					<div class="space-y-1.5">
						<Label for="password">Password</Label>
						<Input
							id="password"
							type="password"
							autocomplete="current-password"
							placeholder="••••••••"
							bind:value={password}
							disabled={submitting}
							aria-invalid={error ? 'true' : undefined}
						/>
					</div>

					{#if error}
						<p class="text-destructive text-sm" role="alert">{error}</p>
					{/if}

					<Button type="submit" class="w-full" disabled={submitting} aria-busy={submitting}>
						{#if submitting}
							<span class="flex items-center justify-center gap-2">
								<LoaderCircle class="size-4 animate-spin" />
								<span>Signing in…</span>
							</span>
						{:else}
							<span>Sign in</span>
						{/if}
					</Button>
				</form>

				<div class="mt-4 text-center text-sm">
					Don't have an account?
					<a href="/signup" class="text-primary hover:underline">Sign up</a>
				</div>
			</CardContent>
		</Card>

		<p class="text-muted-foreground mt-6 text-center text-xs leading-relaxed">
			Demo environment — development credentials only:<br />
			Admin: admin@example.test / SecureAdminPass123!<br />
			Student: student@example.test / SecureStudentPass123!<br />
			Warden: warden@example.test / SecureWardenPass123!
		</p>
	</div>
</main>
