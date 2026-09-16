import { describe, expect, test } from "vitest";
import { toFormData } from "../form-data";

const fileOf = (name: string, content = "binario") =>
	new File([content], name, { type: "image/png" });

describe("toFormData", () => {
	test("appends a File as is", () => {
		const photo = fileOf("foto.png");

		const formData = toFormData({ photo });

		expect(formData.get("photo")).toBe(photo);
	});

	// Misma clave N veces: es lo que permite leerlos con getAll en el servidor. Si
	// se serializaran como JSON, los archivos se perderían.
	test("appends every File of an array under the SAME key", () => {
		const first = fileOf("uno.png");
		const second = fileOf("dos.png");

		const formData = toFormData({ photos: [first, second] });

		expect(formData.getAll("photos")).toEqual([first, second]);
	});

	test("serialises an array of non-files as JSON in a single entry", () => {
		const formData = toFormData({ tags: ["nuevo", "usado"] });

		expect(formData.getAll("tags")).toHaveLength(1);
		expect(formData.get("tags")).toBe('["nuevo","usado"]');
	});

	test("an empty array is serialised as JSON, not dropped", () => {
		const formData = toFormData({ tags: [] });

		expect(formData.get("tags")).toBe("[]");
	});

	test("serialises a plain object as JSON", () => {
		const formData = toFormData({ meta: { page: 2, sort: "asc" } });

		expect(formData.get("meta")).toBe('{"page":2,"sort":"asc"}');
	});

	test("stringifies primitives", () => {
		const formData = toFormData({ page: 2, active: false, name: "Ana" });

		expect(formData.get("page")).toBe("2");
		expect(formData.get("active")).toBe("false");
		expect(formData.get("name")).toBe("Ana");
	});

	// La consecuencia que el JSDoc marca como peligrosa: el servidor NO puede
	// distinguir "no enviado" de "borrar". Quien necesite borrar manda un
	// centinela explícito; este test fija esa frontera para que no cambie por
	// accidente.
	test("omits null and undefined entirely", () => {
		const formData = toFormData({ phone: null, photo: undefined, name: "Ana" });

		expect(formData.has("phone")).toBe(false);
		expect(formData.has("photo")).toBe(false);
		expect(formData.has("name")).toBe(true);
	});

	// Ojo: 0 y "" NO son null/undefined y sí viajan. Es lo correcto —un precio de 0
	// es un dato— y conviene tenerlo fijado.
	test("keeps falsy values that are not null or undefined", () => {
		const formData = toFormData({ price: 0, note: "" });

		expect(formData.get("price")).toBe("0");
		expect(formData.get("note")).toBe("");
	});

	test("an empty object produces empty FormData", () => {
		expect([...toFormData({}).keys()]).toEqual([]);
	});
});
