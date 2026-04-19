import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { AppError, getErrorMessage } from "@/server/http/errors";

export function ok<T>(data: T, init?: ResponseInit) {
  return NextResponse.json({ data }, init);
}

export function created<T>(data: T) {
  return NextResponse.json({ data }, { status: 201 });
}

export function fail(error: unknown) {
  if (error instanceof AppError) {
    return NextResponse.json({ error: error.message }, { status: error.statusCode });
  }

  if (error instanceof ZodError) {
    const firstIssue = error.issues[0];
    const message = firstIssue?.message?.trim() || "Revisa los datos ingresados";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
}
