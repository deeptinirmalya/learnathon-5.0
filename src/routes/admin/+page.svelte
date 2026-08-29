<script lang="ts">
	import { onMount } from 'svelte';
	import { listUsers, createWarden, updateUserPassword, deleteUser } from '$lib/api/admin';
	import type { PublicUser } from '../../server/types/index';
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

	let users = $state<PublicUser[]>([]);
	let loading = $state(true);

	// Create Warden State
	let name = $state('');
	let email = $state('');
	let password = $state('');
	let creating = $state(false);

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

	async function handleUpdatePassword(userId: string) {
		const newPassword = prompt('Enter new password for this user:');
		if (!newPassword) return;
		if (newPassword.length < 8) {
			toast.error('Password must be at least 8 characters');
			return;
		}
		try {
			const res = await updateUserPassword(userId, newPassword);
			toast.success(res.message);
		} catch (e: any) {
			toast.error(e.message || 'Failed to update password');
		}
	}

	async function handleDeleteUser(userId: string, userRole: string) {
		if (userRole === 'admin') {
			toast.error('Cannot delete an admin account');
			return;
		}
		if (!confirm('Are you sure you want to delete this user? This cannot be undone.')) {
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
</script>

<svelte:head><title>Admin Dashboard</title></svelte:head>

<div class="grid gap-6 md:grid-cols-[350px_1fr]">
	<!-- Left Column: Create Warden -->
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
	</div>

	<!-- Right Column: User Management -->
	<div class="space-y-6">
		<Card>
			<CardHeader>
				<CardTitle class="flex items-center gap-2">
					<Users class="text-primary size-5" />
					User Management
				</CardTitle>
				<CardDescription>Manage all students, wardens, and admins in the system.</CardDescription>
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
											<span class="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium 
												{u.role === 'admin' ? 'bg-red-100 text-red-700' : u.role === 'warden' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'}">
												{u.role}
											</span>
										</td>
										<td class="p-3 text-muted-foreground">{u.room || '—'}</td>
										<td class="p-3 text-right">
											<div class="flex justify-end gap-2">
												<Button variant="outline" size="icon" title="Change Password" onclick={() => handleUpdatePassword(u.id)}>
													<KeyRound class="size-4" />
												</Button>
												<Button variant="destructive" size="icon" title="Delete Account" disabled={u.role === 'admin'} onclick={() => handleDeleteUser(u.id, u.role)}>
													<Trash2 class="size-4" />
												</Button>
											</div>
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
