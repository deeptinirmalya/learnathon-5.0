<script lang="ts">
	import { goto } from '$app/navigation';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '$lib/components/ui/card/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { signUp } from '$lib/stores/auth.svelte';
	import LoaderCircle from '@lucide/svelte/icons/loader-circle';
	import SchoolIcon from '@lucide/svelte/icons/school';

	let name = $state('');
	let email = $state('');
	let password = $state('');
	let room = $state('');
	let error = $state<string | null>(null);
	let submitting = $state(false);

	async function handleSubmit(event: SubmitEvent) {
		event.preventDefault();
		error = null;

		if (!name.trim()) {
			error = 'Name is required.';
			return;
		}
		if (name.trim().length < 2) {
			error = 'Name must be at least 2 characters.';
			return;
		}
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
		if (password.length < 6) {
			error = 'Password must be at least 6 characters.';
			return;
		}

		submitting = true;
		const result = await signUp(name.trim(), email.trim(), password, room.trim());
		submitting = false;

		if (result.ok) {
			await goto('/student', { replaceState: true });
		} else {
			error = result.error ?? 'Registration failed. Please try again.';
		}
	}
</script>

<svelte:head><title>Sign up · HostelGrievance</title></svelte:head>

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
				<CardTitle>Create an account</CardTitle>
				<CardDescription>Register as a student to file grievances. (GIET University email only)</CardDescription>
			</CardHeader>
			<CardContent>
				<form onsubmit={handleSubmit} class="space-y-4" novalidate>
					<div class="space-y-1.5">
						<Label for="name">Full Name</Label>
						<Input
							id="name"
							type="text"
							placeholder="John Doe"
							bind:value={name}
							disabled={submitting}
							aria-invalid={error ? 'true' : undefined}
						/>
					</div>
					<div class="space-y-1.5">
						<Label for="email">Email</Label>
						<Input
							id="email"
							type="email"
							placeholder="you@giet.edu"
							bind:value={email}
							disabled={submitting}
							aria-invalid={error ? 'true' : undefined}
						/>
					</div>
					<div class="space-y-1.5">
						<Label for="room">Room Number (Optional)</Label>
						<Input
							id="room"
							type="text"
							placeholder="B-204"
							bind:value={room}
							disabled={submitting}
							aria-invalid={error ? 'true' : undefined}
						/>
					</div>
					<div class="space-y-1.5">
						<Label for="password">Password</Label>
						<Input
							id="password"
							type="password"
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
								<span>Registering…</span>
							</span>
						{:else}
							<span>Sign up</span>
						{/if}
					</Button>
				</form>

				<div class="mt-4 text-center text-sm">
					Already have an account?
					<a href="/login" class="text-primary hover:underline">Sign in</a>
				</div>
			</CardContent>
		</Card>
	</div>
</main>
