<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { listUsers, createWarden, updateUserPassword, deleteUser, changeMyPassword } from '$lib/api/admin';
	import { signOut, getSession } from '$lib/stores/auth.svelte';
	import type { PublicUser } from '../../server/types/index.ts';
	import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '$lib/components/ui/card/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { toast } from 'svelte-sonner';
	import KeyRound from '@lucide/svelte/icons/key-round';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import Plus from '@lucide/svelte/icons/plus';
	import Users from '@lucide/svelte/icons/users';
	import UserCog from '@lucide/svelte/icons/user-cog';
	import ShieldCheck from '@lucide/svelte/icons/shield-check';

	const currentAdmin = getSession();

	let users = $state<PublicUser[]>([]);
	let loading = $state(true);

	// Create Warden State
	let name = $state('');
	let email = $state('');
	let password = $state('');
	let creating = $state(false);

	// Change my password state
	let curPw = $state('');
	let newPw = $state('');
	let confirmPw = $state('');
	let changingPw = $state(false);

	async function loadUsers() {
		try {
			const res = await listUsers();
			users = res.users;
		} catch (e: any) {
			toast.error(e.message || 'Failed to load users');
		} finally {
			loading = false;
		}
	}

	onMount(() => {
		loadUsers();
	});

	async function handleCreateWarden(e: Event) {
		e.preventDefault();
		if (!name || !email || !password) {
			toast.error('All fields are required');
			return;
		}
		creating = true;
		try {
			await createWarden({ name, email, password });
			toast.success('Warden account created successfully!');
			name = ''; email = ''; password = '';
			await loadUsers();
		} catch (e: any) {
			toast.error(e.message || 'Failed to create warden');
		} finally {
			creating = false;
		}
	}

	async function handleChangePassword(e: Event) {
		e.preventDefault();
		if (!curPw || !newPw || !confirmPw) {
			toast.error('All fields are required');
			return;
		}
		if (newPw !== confirmPw) {
			toast.error('New password and confirmation do not match');
			return;
		}
		if (newPw.length < 8) {
			toast.error('Password must be at least 8 characters');
			return;
		}
		changingPw = true;
		const result = await changeMyPassword(curPw, newPw);
		changingPw = false;
		if (result.ok) {
			toast.success('Password changed. Please sign in again.');
			await signOut();
			await goto('/login', { replaceState: true });
		} else {
			toast.error(result.error);
		}
	}

	async function handleUpdatePassword(userId: string) {
		const newPassword = prompt('Enter new password for this warden:');
		if (!newPassword) return;
		if (newPassword.length < 8) {
			toast.error('Password must be at least 8 characters');
			return;
		}
		try {
			const res = await updateUserPassword(userId, newPassword);
			toast.success(res.message);
			await loadUsers();
		} catch (e: any) {
			toast.error(e.message || 'Failed to update password');
		}
	}

	async function handleDeleteUser(userId: string) {
		if (!confirm('Are you sure you want to remove this warden? Their comments will also be deleted. This cannot be undone.')) {
			return;
		}
		try {
			const res = await deleteUser(userId);
			toast.success(res.message);
			await loadUsers();
		} catch (e: any) {
			toast.error(e.message || 'Failed to delete user');
		}
	}

	function roleBadgeClass(role: string): string {
		if (role === 'admin') return 'bg-red-100 text-red-700';
		if (role === 'warden') return 'bg-blue-100 text-blue-700';
		return 'bg-green-100 text-green-700';
	}

	function isSelf(id: string): boolean {
		return !!currentAdmin && currentAdmin.id === id;
	}
</script>

<svelte:head><title>Admin Dashboard</title></svelte:head>

<div class="grid gap-6 md:grid-cols-[350px_1fr]">
	<!-- Left Column: Create Warden + Change password -->
	<div class="space-y-6">
		<Card>
			<CardHeader>
				<CardTitle class="flex items-center gap-2">
					<UserCog class="text-primary size-5" />
					Create Warden
				</CardTitle>
				<CardDescription>Provision a new warden account for hostel administration.</CardDescription>
			</CardHeader>
			<CardContent>
				<form onsubmit={handleCreateWarden} class="space-y-4">
					<div class="space-y-2">
						<Label for="name">Full Name</Label>
						<Input id="name" placeholder="John Doe" bind:value={name} />
					</div>
					<div class="space-y-2">
						<Label for="email">Email Address</Label>
						<Input id="email" type="email" placeholder="warden@giet.edu" bind:value={email} />
					</div>
					<div class="space-y-2">
						<Label for="password">Initial Password</Label>
						<Input id="password" type="password" placeholder="••••••••" bind:value={password} />
					</div>
					<Button type="submit" class="w-full" disabled={creating}>
						{#if creating}
							Creating...
						{:else}
							<Plus class="mr-2 size-4" /> Create Account
						{/if}
					</Button>
				</form>
			</CardContent>
		</Card>

		<Card>
			<CardHeader>
				<CardTitle class="flex items-center gap-2">
					<ShieldCheck class="text-primary size-5" />
					Change My Password
				</CardTitle>
				<CardDescription>Update the password for your own admin account.</CardDescription>
			</CardHeader>
			<CardContent>
				<form onsubmit={handleChangePassword} class="space-y-4">
					<div class="space-y-2">
						<Label for="current-pw">Current Password</Label>
						<Input id="current-pw" type="password" autocomplete="current-password" bind:value={curPw} />
					</div>
					<div class="space-y-2">
						<Label for="new-pw">New Password</Label>
						<Input id="new-pw" type="password" autocomplete="new-password" bind:value={newPw} />
					</div>
					<div class="space-y-2">
						<Label for="confirm-pw">Confirm New Password</Label>
						<Input id="confirm-pw" type="password" autocomplete="new-password" bind:value={confirmPw} />
					</div>
					<Button type="submit" variant="outline" class="w-full" disabled={changingPw}>
						{changingPw ? 'Updating...' : 'Change password'}
					</Button>
				</form>
			</CardContent>
		</Card>
	</div>

	<!-- Right Column: User Management -->
	<div class="space-y-6">
		<Card>
			<CardHeader>
				<CardTitle class="flex items-center gap-2">
					<Users class="text-primary size-5" />
					User Management
				</CardTitle>
				<CardDescription>Admins can add wardens, reset warden passwords, and remove wardens. Student accounts are read-only here.</CardDescription>
			</CardHeader>
			<CardContent>
				{#if loading}
					<div class="py-8 text-center text-sm text-muted-foreground">Loading users...</div>
				{:else}
					<div class="rounded-md border">
						<table class="w-full text-sm">
							<thead class="bg-muted/50 border-b text-left">
								<tr>
									<th class="p-3 font-medium">Name</th>
									<th class="p-3 font-medium">Role</th>
									<th class="p-3 font-medium">Room</th>
									<th class="p-3 font-medium text-right">Actions</th>
								</tr>
							</thead>
							<tbody>
								{#each users as u}
									<tr class="border-b last:border-0 hover:bg-muted/20">
										<td class="p-3">
											<div class="font-medium">{u.name}</div>
											<div class="text-xs text-muted-foreground">{u.email}</div>
										</td>
										<td class="p-3">
											<span class="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium {roleBadgeClass(u.role)}">
												{u.role}{isSelf(u.id) ? ' (you)' : ''}
											</span>
										</td>
										<td class="p-3 text-muted-foreground">{u.room || '—'}</td>
										<td class="p-3 text-right">
											{#if u.role === 'warden'}
												<div class="flex justify-end gap-2">
													<Button variant="outline" size="icon" title="Change password" onclick={() => handleUpdatePassword(u.id)}>
														<KeyRound class="size-4" />
													</Button>
													<Button variant="destructive" size="icon" title="Remove warden" onclick={() => handleDeleteUser(u.id)}>
														<Trash2 class="size-4" />
													</Button>
												</div>
											{:else}
												<span class="text-muted-foreground text-xs">—</span>
											{/if}
										</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
				{/if}
			</CardContent>
		</Card>
	</div>
</div>