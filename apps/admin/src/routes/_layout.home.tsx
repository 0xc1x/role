import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, ShoppingBag, Store, Users } from "lucide-react";
import { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuthUser } from "@/features/auth";
import { useBusinessesList } from "@/features/businesses";
import { useEmailSendsList } from "@/features/email-sends";
import { usePlatformStats } from "@/features/stats";
import { formatBusinessDate } from "@/lib/dates";
import { emailSendStatusLabel } from "@/lib/labels";

export const Route = createFileRoute("/_layout/home")({
	component: HomePage,
	head: () => ({
		meta: [
			{ title: "Inicio | Role" },
			{ name: "description", content: "Panel de inicio de Role" },
		],
	}),
});

const PENDING_BUSINESSES_QUERY = {
	verification_status: "pending",
	limit: 5,
	page: 1,
} as const;

const PENDING_SENDS_QUERY = {
	status: "pending",
	limit: 5,
	page: 1,
} as const;

type BusinessItem = NonNullable<
	ReturnType<typeof useBusinessesList>["data"]
>["data"][number];
type EmailSendItem = NonNullable<
	ReturnType<typeof useEmailSendsList>["data"]
>["data"][number];
type PendingBusinessView = Pick<BusinessItem, "id" | "name"> & {
	createdAt: string;
};

function HomeLoadingSkeleton() {
	return (
		<div className="w-full p-8 space-y-6">
			<Skeleton className="h-10 w-72" />
			<div className="grid grid-cols-1 md:grid-cols-4 gap-6 mt-8">
				{[1, 2, 3, 4].map((n) => (
					<div key={n} className="rounded-lg border p-6 space-y-2">
						<Skeleton className="h-6 w-16" />
						<Skeleton className="h-8 w-12" />
					</div>
				))}
			</div>
		</div>
	);
}

/**
 * Una métrica sin dato NUNCA es 0: "0 negocios por aprobar" con la API caída se
 * lee como "no hay nada que aprobar". Si la query falló se muestra "—".
 */
function MetricValue({
	isLoading,
	value,
	suffix,
}: {
	isLoading: boolean;
	value: number | undefined;
	suffix?: string;
}) {
	if (isLoading) return <Skeleton className="h-8 w-12" />;
	if (value === undefined) {
		return (
			<span
				className="text-muted-foreground"
				title="Dato no disponible: la consulta falló"
			>
				—
			</span>
		);
	}
	return (
		<>
			{value}
			{suffix}
		</>
	);
}

function UnavailableState({
	message,
	onRetry,
}: {
	message: string;
	onRetry: () => void;
}) {
	return (
		<div className="flex flex-col items-start gap-3">
			<p className="text-destructive text-sm">{message}</p>
			<Button variant="outline" size="sm" onClick={onRetry}>
				Reintentar
			</Button>
		</div>
	);
}

// react-doctor-disable-next-line react-doctor/no-multi-component-file -- route-colocated cards, single-use in HomePage
function PendingBusinessesCard({
	businesses,
	isError,
	error,
	onRetry,
}: {
	businesses: PendingBusinessView[];
	isError: boolean;
	error: unknown;
	onRetry: () => void;
}) {
	return (
		<Card>
			<CardHeader className="flex flex-row items-center justify-between">
				<CardTitle>Negocios recientes pendientes</CardTitle>
				<Link
					to="/negocios"
					search={{ page: 1, limit: 10, verification_status: "pending" }}
				>
					<Button variant="ghost" size="sm">
						Ver todo <ArrowRight className="ml-1 h-4 w-4" />
					</Button>
				</Link>
			</CardHeader>
			<CardContent>
				{isError ? (
					<UnavailableState
						message={
							error instanceof Error
								? `No se pudieron cargar los negocios pendientes: ${error.message}`
								: "No se pudieron cargar los negocios pendientes"
						}
						onRetry={onRetry}
					/>
				) : businesses.length ? (
					<ul className="space-y-3">
						{businesses.map((b) => (
							<li
								key={b.id}
								className="flex items-center justify-between border-b pb-2 last:border-0"
							>
								<span className="font-medium text-sm">{b.name}</span>
								<span className="text-xs text-muted-foreground">
									{b.createdAt}
								</span>
							</li>
						))}
					</ul>
				) : (
					<p className="text-sm text-muted-foreground">
						No hay pendientes — ¡todo al día!
					</p>
				)}
			</CardContent>
		</Card>
	);
}

// react-doctor-disable-next-line react-doctor/no-multi-component-file -- route-colocated cards, single-use in HomePage
function QueuedEmailsCard({
	emails,
	isError,
	error,
	onRetry,
}: {
	emails: EmailSendItem[];
	isError: boolean;
	error: unknown;
	onRetry: () => void;
}) {
	return (
		<Card>
			<CardHeader className="flex flex-row items-center justify-between">
				<CardTitle>Emails en cola</CardTitle>
				<Link
					to="/notificaciones/mails"
					search={{ tab: "envios", status: "pending" }}
				>
					<Button variant="ghost" size="sm">
						Ver todo <ArrowRight className="ml-1 h-4 w-4" />
					</Button>
				</Link>
			</CardHeader>
			<CardContent>
				{isError ? (
					<UnavailableState
						message={
							error instanceof Error
								? `No se pudo cargar la cola de correos: ${error.message}`
								: "No se pudo cargar la cola de correos"
						}
						onRetry={onRetry}
					/>
				) : emails.length ? (
					<ul className="space-y-3">
						{emails.map((e) => (
							<li
								key={e.id}
								className="flex items-center justify-between border-b pb-2 last:border-0"
							>
								<span className="text-sm truncate max-w-[180px]">
									{e.email}
								</span>
								<Badge variant="secondary" className="text-xs">
									{emailSendStatusLabel(e.status)}
								</Badge>
							</li>
						))}
					</ul>
				) : (
					<p className="text-sm text-muted-foreground">Cola vacía</p>
				)}
			</CardContent>
		</Card>
	);
}

// react-doctor-disable-next-line react-doctor/no-multi-component-file -- route file owns HomePage + its loading skeleton
function HomePage() {
	const { data: user, isLoading: authLoading } = useAuthUser();
	const {
		data: stats,
		isLoading: statsLoading,
		isError: statsError,
		refetch: refetchStats,
	} = usePlatformStats();

	const {
		data: pendingData,
		isLoading: pendingLoading,
		isError: pendingError,
		error: pendingErrorDetail,
		refetch: refetchPending,
	} = useBusinessesList(PENDING_BUSINESSES_QUERY);
	const { data: totalData } = useBusinessesList({ limit: 1, page: 1 });
	const {
		data: emailsData,
		isError: emailsError,
		error: emailsErrorDetail,
		refetch: refetchEmails,
	} = useEmailSendsList(PENDING_SENDS_QUERY);

	const pendingBusinesses: PendingBusinessView[] = useMemo(
		() =>
			(pendingData?.data ?? []).slice(0, 5).map((b) => ({
				id: b.id,
				name: b.name,
				createdAt: formatBusinessDate(b.created_at),
			})),
		[pendingData],
	);
	const queuedEmails: EmailSendItem[] = useMemo(
		() => (emailsData?.data ?? []).slice(0, 5),
		[emailsData],
	);

	if (authLoading) {
		return <HomeLoadingSkeleton />;
	}

	// `undefined` = sin dato conocido. Se distingue de 0 a propósito: sin esta
	// separación una API caída muestra "0" y el operador aprueba sobre una mentira.
	const totalBusinesses = totalData?.meta.total ?? stats?.businesses;
	const usersCount = stats?.users;
	const mealsCount = stats?.meals_saved;

	return (
		<div className="w-full p-8 space-y-6">
			<div>
				<h1 className="text-3xl font-bold">
					Bienvenido, {user?.full_name ?? user?.email ?? "Admin"}
				</h1>
				<p className="text-muted-foreground">Resumen de tu plataforma</p>
			</div>

			<div className="grid grid-cols-1 md:grid-cols-4 gap-6">
				<Card className="border-warning/30 bg-warning/5 dark:bg-warning/10">
					<CardHeader className="flex flex-row items-center justify-between pb-2">
						<CardTitle className="text-sm font-medium">Pendientes</CardTitle>
						<Store className="h-4 w-4 text-warning" />
					</CardHeader>
					<CardContent>
						<div className="text-3xl font-bold">
							<MetricValue
								isLoading={statsLoading || pendingLoading}
								value={pendingData?.meta.total}
							/>
						</div>
						<p className="text-xs text-muted-foreground">
							Negocios por aprobar
						</p>
						<div className="mt-2 flex items-center gap-3">
							<Link
								to="/negocios"
								search={{ page: 1, limit: 10, verification_status: "pending" }}
								className="text-xs text-warning hover:underline inline-flex items-center gap-1"
							>
								Ver pendientes <ArrowRight className="h-3 w-3" />
							</Link>
							{statsError || pendingError ? (
								<Button
									variant="outline"
									size="sm"
									onClick={() => {
										void refetchStats();
										void refetchPending();
									}}
								>
									Reintentar
								</Button>
							) : null}
						</div>
					</CardContent>
				</Card>
				<Card>
					<CardHeader className="flex flex-row items-center justify-between pb-2">
						<CardTitle className="text-sm font-medium">Negocios</CardTitle>
						<Store className="h-4 w-4 text-muted-foreground" />
					</CardHeader>
					<CardContent>
						<div className="text-3xl font-bold">
							<MetricValue isLoading={statsLoading} value={totalBusinesses} />
						</div>
						<p className="text-xs text-muted-foreground">Total comercios</p>
					</CardContent>
				</Card>
				<Card>
					<CardHeader className="flex flex-row items-center justify-between pb-2">
						<CardTitle className="text-sm font-medium">Usuarios</CardTitle>
						<Users className="h-4 w-4 text-muted-foreground" />
					</CardHeader>
					<CardContent>
						<div className="text-3xl font-bold">
							<MetricValue
								isLoading={statsLoading}
								value={usersCount}
								suffix="+"
							/>
						</div>
						<p className="text-xs text-muted-foreground">Usuarios activos</p>
					</CardContent>
				</Card>
				<Card>
					<CardHeader className="flex flex-row items-center justify-between pb-2">
						<CardTitle className="text-sm font-medium">Comidas</CardTitle>
						<ShoppingBag className="h-4 w-4 text-muted-foreground" />
					</CardHeader>
					<CardContent>
						<div className="text-3xl font-bold">
							<MetricValue
								isLoading={statsLoading}
								value={mealsCount}
								suffix="+"
							/>
						</div>
						<p className="text-xs text-muted-foreground">Rescatadas</p>
					</CardContent>
				</Card>
			</div>

			<div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
				<PendingBusinessesCard
					businesses={pendingBusinesses}
					isError={pendingError}
					error={pendingErrorDetail}
					onRetry={() => void refetchPending()}
				/>
				<QueuedEmailsCard
					emails={queuedEmails}
					isError={emailsError}
					error={emailsErrorDetail}
					onRetry={() => void refetchEmails()}
				/>
			</div>
		</div>
	);
}
