import { createClient } from "npm:@supabase/supabase-js@2";

const origins = new Set([
  "https://caiosan0304.github.io",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
]);
const encoder = new TextEncoder();
const toHex = (buffer: ArrayBuffer) =>
  [...new Uint8Array(buffer)]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
const validString = (value: unknown, max = 120) =>
  typeof value === "string" && value.trim().length > 0 && value.length <= max;
const json = (body: unknown, status = 200, origin = "") =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      "access-control-allow-origin": origin,
      "access-control-allow-headers":
        "content-type,x-admin-password,authorization,apikey",
      vary: "origin",
    },
  });

Deno.serve(async (request) => {
  const origin = request.headers.get("origin") || "";
  const corsOrigin = origins.has(origin) ? origin : "";
  const configured = Boolean(Deno.env.get("ADMIN_PASSWORD_SHA256"));

  if (
    request.method === "GET" &&
    new URL(request.url).pathname.endsWith("/health")
  ) {
    return json({ ok: true, configured });
  }
  if (request.method === "OPTIONS") {
    return corsOrigin
      ? new Response(null, {
          headers: {
            "access-control-allow-origin": corsOrigin,
            "access-control-allow-headers":
              "content-type,x-admin-password,authorization,apikey",
            "access-control-allow-methods": "POST,OPTIONS",
          },
        })
      : new Response(null, { status: 403 });
  }
  if (!corsOrigin) return json({ error: "Origem não permitida" }, 403);

  try {
    const password = request.headers.get("x-admin-password") || "";
    const expected = Deno.env.get("ADMIN_PASSWORD_SHA256") || "";
    const actual = toHex(
      await crypto.subtle.digest("SHA-256", encoder.encode(password)),
    );
    if (!expected || actual !== expected)
      return json({ error: "Senha inválida" }, 401, corsOrigin);

    const { action, payload = {} } = await request.json();
    if (action === "verify") return json({ ok: true }, 200, corsOrigin);

    const specs: Record<
      string,
      { table: string; operation: "insert" | "update" | "delete" }
    > = {
      create_room: { table: "rooms", operation: "insert" },
      update_room: { table: "rooms", operation: "update" },
      delete_room: { table: "rooms", operation: "delete" },
      create_teacher: { table: "teachers", operation: "insert" },
      update_teacher: { table: "teachers", operation: "update" },
      delete_teacher: { table: "teachers", operation: "delete" },
      create_schedule: { table: "class_schedules", operation: "insert" },
      update_schedule: { table: "class_schedules", operation: "update" },
      delete_schedule: { table: "class_schedules", operation: "delete" },
      update_settings: { table: "app_settings", operation: "update" },
    };
    const spec = specs[action];
    if (!spec) return json({ error: "Ação inválida" }, 400, corsOrigin);

    const clean = { ...payload };
    if (
      spec.table === "rooms" &&
      (!validString(clean.code, 20) || !validString(clean.destination))
    ) {
      return json({ error: "Sala inválida" }, 400, corsOrigin);
    }
    if (spec.table === "teachers" && !validString(clean.name)) {
      return json({ error: "Professor inválido" }, 400, corsOrigin);
    }
    if (
      spec.table === "class_schedules" &&
      spec.operation !== "delete" &&
      (!validString(clean.class_code, 40) ||
        !validString(clean.teacher_id, 36) ||
        !validString(clean.room_id, 36) ||
        !Number.isInteger(clean.weekday))
    ) {
      return json({ error: "Turma inválida" }, 400, corsOrigin);
    }

    const id = clean.id;
    delete clean.id;
    delete clean.created_at;
    delete clean.updated_at;
    delete clean.manual_status;
    delete clean.manual_status_date;

    const database = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );
    const query =
      spec.operation === "insert"
        ? database.from(spec.table).insert(clean).select()
        : spec.operation === "update"
          ? database.from(spec.table).update(clean).eq("id", id).select()
          : database.from(spec.table).delete().eq("id", id);
    const { data, error } = await query;
    if (error) return json({ error: error.message }, 400, corsOrigin);
    return json({ data }, 200, corsOrigin);
  } catch {
    return json({ error: "Requisição inválida" }, 400, corsOrigin);
  }
});
