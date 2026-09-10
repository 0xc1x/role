// ponytail: expo-image-picker en web abre el diálogo con un click sintético
// sin user activation → nunca abre y el await queda colgado. Input nativo
// con click() síncrono dentro del handler; migrar de vuelta si upstream lo
// arregla.
export function pickWebImage(): Promise<string | null> {
	return new Promise((resolve) => {
		const input = document.createElement("input");
		input.type = "file";
		input.accept = "image/*";
		let done = false;
		const finish = (value: string | null) => {
			if (done) return;
			done = true;
			resolve(value);
			input.remove();
		};
		input.onchange = () =>
			finish(input.files?.[0] ? URL.createObjectURL(input.files[0]) : null);
		input.oncancel = () => finish(null);
		document.body.appendChild(input);
		input.click();
	});
}
