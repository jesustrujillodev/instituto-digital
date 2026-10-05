import type { ShouldRevalidateFunction } from "react-router";
import { shouldRevalidateAfterDelete } from "../../../utils/content-form";

export { action } from "./index.action";
export { loader } from "./index.loader";

export const shouldRevalidate: ShouldRevalidateFunction =
	shouldRevalidateAfterDelete;
