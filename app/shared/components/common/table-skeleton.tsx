import { Card, CardContent, CardHeader } from "@/shared/components/ui/card";
import { Skeleton } from "@/shared/components/ui/skeleton";

export const TableSkeleton = () => {
	return (
		<>
			{/* Desktop Skeleton */}
			<div className="hidden md:block overflow-x-auto">
				<table className="min-w-full divide-y divide-border">
					<thead className="bg-muted/50">
						<tr>
							<th scope="col" className="px-6 py-3 text-left">
								<Skeleton className="h-4 w-20" />
							</th>
							<th scope="col" className="px-6 py-3 text-left">
								<Skeleton className="h-4 w-24" />
							</th>
							<th scope="col" className="px-6 py-3 text-left">
								<Skeleton className="h-4 w-28" />
							</th>
							<th scope="col" className="px-6 py-3">
								<Skeleton className="h-4 w-16 ml-auto" />
							</th>
						</tr>
					</thead>
					<tbody className="divide-y divide-border bg-card">
						{Array.from({ length: 5 }).map((_, i) => (
							// biome-ignore lint/suspicious/noArrayIndexKey: La lista de Skeletons es estática y nunca cambiará
							<tr key={i}>
								<td className="whitespace-nowrap px-6 py-4">
									<Skeleton className="h-4 w-32" />
								</td>
								<td className="px-6 py-4">
									<Skeleton className="h-4 w-48" />
								</td>
								<td className="whitespace-nowrap px-6 py-4">
									<Skeleton className="h-4 w-24" />
								</td>
								<td className="whitespace-nowrap px-6 py-4">
									<div className="flex justify-end gap-1">
										<Skeleton className="h-8 w-8 rounded-lg" />
										<Skeleton className="h-8 w-8 rounded-lg" />
									</div>
								</td>
							</tr>
						))}
					</tbody>
				</table>
			</div>

			{/* Mobile Skeleton */}
			<div className="md:hidden p-4 space-y-4">
				{Array.from({ length: 3 }).map((_, i) => (
					// biome-ignore lint/suspicious/noArrayIndexKey: La lista de Skeletons es estática y nunca cambiará
					<Card key={i}>
						<CardHeader className="pb-3">
							<div className="flex items-start justify-between">
								<div className="flex-1 space-y-2">
									<Skeleton className="h-5 w-32" />
									<Skeleton className="h-3 w-24" />
								</div>
								<div className="flex gap-1 ml-2">
									<Skeleton className="h-8 w-8 rounded-lg" />
									<Skeleton className="h-8 w-8 rounded-lg" />
								</div>
							</div>
						</CardHeader>
						<CardContent className="pt-0">
							<Skeleton className="h-4 w-full" />
							<Skeleton className="h-4 w-3/4 mt-2" />
						</CardContent>
					</Card>
				))}
			</div>
		</>
	);
};
