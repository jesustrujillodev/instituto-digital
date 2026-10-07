import * as v from "valibot";
import { operationsListRule } from "./operations.rules";

export const validateOperationsList = (data: unknown) =>
	v.parse(operationsListRule, data);
