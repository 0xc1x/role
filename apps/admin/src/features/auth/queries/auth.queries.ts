import type { LoginRequest, RegisterRequest } from "@0xc1x/role-commons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { getToken } from "@/lib/api/client";
import { logout as apiLogout, getMe, login, register } from "../api/auth.api";
import { authKeys } from "./auth.keys";

export function useAuthUser() {
	return useQuery({
		queryKey: authKeys.me(),
		queryFn: async () => {
			const res = await getMe();
			return res.user;
		},
		enabled: !!getToken(),
		retry: false,
		staleTime: 5 * 60 * 1000,
	});
}

export function useLogin() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (body: LoginRequest) => login(body),
		onSuccess: (data) => {
			queryClient.setQueryData(authKeys.me(), data.user);
		},
	});
}

export function useRegister() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (body: RegisterRequest) => register(body),
		onSuccess: (data) => {
			queryClient.setQueryData(authKeys.me(), data.user);
		},
	});
}

export function useLogout() {
	const queryClient = useQueryClient();
	const navigate = useNavigate();
	return () => {
		apiLogout();
		queryClient.clear();
		navigate({ to: "/login" });
	};
}
