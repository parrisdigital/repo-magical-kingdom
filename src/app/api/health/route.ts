import { NextResponse } from "next/server";

import packageJson from "../../../../package.json";

export const runtime = "nodejs";

export function GET() {
  return NextResponse.json(
    {
      status: "operational",
      service: "repo-magical-kingdom",
      version: packageJson.version,
      worldSchema: "repo-kingdom/v1",
      seasons: 4,
      commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null,
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}
