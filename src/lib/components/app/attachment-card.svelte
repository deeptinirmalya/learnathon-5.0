<script lang="ts">
	import { Card, CardContent } from '$lib/components/ui/card/index.js';
	import type { Attachment } from '$lib/types';
	import FileIcon from '@lucide/svelte/icons/file';

	let { attachment }: { attachment: Attachment } = $props();
</script>

<Card class="py-3">
	<CardContent class="flex items-center gap-3 px-3">
		<span
			class="bg-muted text-muted-foreground flex size-9 shrink-0 items-center justify-center rounded-md"
			aria-hidden="true"
		>
			<FileIcon class="size-4" />
		</span>
		<div class="min-w-0">
			<p class="truncate text-sm font-medium">
				<a
					class="hover:underline"
					href={attachment.url}
					target="_blank"
					rel="noreferrer"
				>
					{attachment.filename}
				</a>
			</p>
			<p class="text-muted-foreground text-xs">
				{attachment.contentType}
			</p>
		</div>
	</CardContent>
</Card>
