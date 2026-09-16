import type { ICradle } from "@/shared/di/container.types";

// Le decimos a TypeScript que la interfaz RouterContextProvider
// AHORA TAMBIÉN incluye todo lo que está en nuestra ICradle
declare module "react-router" {
	interface RouterContextProvider extends ICradle {}
}
