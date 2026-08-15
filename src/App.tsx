import { useCallback, useEffect, useMemo, useState } from "react";
import { HashRouter, Navigate, Route, Routes } from "react-router-dom";
import { Castle, Landmark, MapPin, Plane } from "lucide-react";
import {
  defaultSettings,
  effectiveStatus,
  invokeAdmin,
  loadData,
  supabase,
  zonedParts,
} from "./lib";
import {
  STATUSES,
  STATUS_LABELS,
  type FlightStatus,
  type Room,
  type Schedule,
  type Settings,
  type Teacher,
} from "./types";
import "./styles.css";
type Data = {
  rooms: Room[];
  teachers: Teacher[];
  schedules: Schedule[];
  settings: Settings;
};
const empty: Data = {
  rooms: [],
  teachers: [],
  schedules: [],
  settings: defaultSettings,
};
function useData() {
  const [data, setData] = useState<Data>(() => {
      try {
        return (
          JSON.parse(localStorage.getItem("fids-cache") || "null") || empty
        );
      } catch {
        return empty;
      }
    }),
    [offline, setOffline] = useState(false);
  const refresh = useCallback(async () => {
    try {
      const d = await loadData();
      setData(d);
      localStorage.setItem("fids-cache", JSON.stringify(d));
      setOffline(false);
    } catch {
      setOffline(true);
    }
  }, []);
  useEffect(() => {
    refresh();
    const c = supabase.channel("fids-live");
    ["rooms", "teachers", "class_schedules", "app_settings"].forEach((table) =>
      c.on(
        "postgres_changes",
        { event: "*", schema: "public", table },
        refresh,
      ),
    );
    c.subscribe();
    window.addEventListener("online", refresh);
    return () => {
      supabase.removeChannel(c);
      window.removeEventListener("online", refresh);
    };
  }, [refresh]);
  return { data, offline, refresh };
}
function Icon({ name }: { name: string | null }) {
  if (
    name &&
    [
      "disney",
      "frog",
      "canada",
      "new-orleans",
      "london",
      "paris",
      "mexico",
      "new-york",
    ].includes(name)
  )
    return (
      <img
        src={import.meta.env.BASE_URL + "destinations/" + name + ".svg"}
        alt=""
        aria-hidden="true"
      />
    );
  return name === "castle" ? (
    <Castle />
  ) : name === "landmark" ? (
    <Landmark />
  ) : (
    <MapPin />
  );
}
function Status({ value }: { value: FlightStatus }) {
  return (
    <span className={"status status-" + value}>{STATUS_LABELS[value]}</span>
  );
}
function Board() {
  const { data, offline } = useData(),
    [now, setNow] = useState(new Date()),
    [page, setPage] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  const p = zonedParts(now),
    flights = useMemo(
      () =>
        data.schedules
          .filter(
            (s) =>
              s.enabled &&
              s.weekday === p.weekday &&
              s.active_from <= p.date &&
              (!s.active_until || s.active_until >= p.date),
          )
          .map((s) => ({
            ...s,
            room: data.rooms.find((r) => r.id === s.room_id),
            status: effectiveStatus(s, data.settings, p.date, p.minutes),
          }))
          .filter((s) => s.status && s.room?.enabled)
          .sort(
            (a, b) =>
              a.start_time.localeCompare(b.start_time) ||
              a.class_code.localeCompare(b.class_code),
          ),
      [data, p.date, p.minutes, p.weekday],
    ),
    perPage = innerHeight < 850 ? 8 : 10,
    total = Math.max(1, Math.ceil(flights.length / perPage));
  useEffect(() => {
    const id = setInterval(
      () => setPage((x) => (x + 1) % total),
      data.settings.page_rotation_seconds * 1000,
    );
    return () => clearInterval(id);
  }, [total, data.settings.page_rotation_seconds]);
  const date = new Intl.DateTimeFormat("en-GB", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "short",
    year: "numeric",
  })
    .format(now)
    .toUpperCase();
  return (
    <main className="board">
      <header>
        <div className="departures">
          <span className="plane">
            <Plane />
          </span>
          <strong>PARTIDAS</strong>
          <span>DEPARTURES</span>
        </div>
        <div className="terminal">
          BARUERI TERMINAL <b>{p.time}</b>
          <span>{date}</span>
          {offline && <em>SEM CONEXÃO</em>}
        </div>
      </header>
      <div className="flight-grid grid-head">
        <div>TURMA / FLIGHT</div>
        <div>DESTINO / DESTINATION</div>
        <div>PORTÃO / GATE</div>
        <div>HORÁRIO / TIME</div>
        <div>STATUS</div>
      </div>
      <section className="rows">
        {flights.slice(page * perPage, (page + 1) * perPage).map((s) => (
          <div className="flight-grid flight-row" key={s.id}>
            <div className="code">{s.class_code}</div>
            <div className="destination">
              <Icon name={s.room!.icon_key} />
              <div>
                <b>{s.room!.destination}</b>
                {s.room!.subtitle && <small>{s.room!.subtitle}</small>}
              </div>
            </div>
            <div className="gate">{s.room!.code}</div>
            <div className="flight-time">{s.start_time.slice(0, 5)}</div>
            <div>
              <Status value={s.status!} />
            </div>
          </div>
        ))}
        {!flights.length && (
          <div className="no-flights">
            NENHUMA PARTIDA PROGRAMADA NO MOMENTO
            <small>NO DEPARTURES SCHEDULED</small>
          </div>
        )}
      </section>
      <footer>
        <span>ⓘ</span>
        <p>
          WELCOME ABOARD · FIND YOUR GATE · SPEAK ENGLISH AND ENJOY YOUR TRIP
        </p>
        <b>
          {page + 1} / {total}
        </b>
      </footer>
    </main>
  );
}
function Staff() {
  const { data, refresh } = useData(),
    [selected, setSelected] = useState(
      localStorage.getItem("fids-teacher") || "",
    ),
    p = zonedParts();
  const choose = (id: string) => {
      setSelected(id);
      if (id) localStorage.setItem("fids-teacher", id);
      else localStorage.removeItem("fids-teacher");
    },
    update = async (s: Schedule, status: FlightStatus | null) => {
      const { error } = await supabase.rpc("set_class_manual_status", {
        schedule_id: s.id,
        teacher_id: selected,
        new_status: status,
      });
      if (error)
        alert("Não foi possível atualizar o status. Tente novamente.");
      else refresh();
    };
  if (!selected)
    return (
      <main className="staff shell">
        <Plane />
        <h1>CONTROLE DE EMBARQUE</h1>
        <p>Quem é você?</p>
        <div className="teacher-list">
          {data.teachers
            .filter((t) => t.enabled)
            .map((t) => (
              <button key={t.id} onClick={() => choose(t.id)}>
                {t.name}
              </button>
            ))}
        </div>
      </main>
    );
  const list = data.schedules.filter(
    (s) =>
      s.teacher_id === selected &&
      s.enabled &&
      s.weekday === p.weekday &&
      s.active_from <= p.date &&
      (!s.active_until || s.active_until >= p.date),
  );
  return (
    <main className="staff shell">
      <header>
        <h1>{data.teachers.find((t) => t.id === selected)?.name}</h1>
        <button className="link" onClick={() => choose("")}>
          Trocar professor
        </button>
      </header>
      {!list.length && <p>Nenhuma turma programada para você hoje.</p>}
      {list.map((s) => {
        const room = data.rooms.find((r) => r.id === s.room_id),
          status =
            effectiveStatus(s, data.settings, p.date, p.minutes) || "on_time",
          next = STATUSES[STATUSES.indexOf(status) + 1];
        return (
          <section className="staff-flight" key={s.id}>
            <div>
              <small>
                {s.manual_status && s.manual_status_date === p.date
                  ? "MANUAL"
                  : "AUTOMÁTICO"}
              </small>
              <h2>{s.class_code}</h2>
              <p>
                {s.start_time.slice(0, 5)}–{s.end_time.slice(0, 5)} · PORTÃO{" "}
                {room?.code}
              </p>
              <b>{room?.destination}</b>
            </div>
            <Status value={status} />
            <button
              className="primary"
              disabled={!next}
              onClick={() => update(s, next)}
            >
              AVANÇAR STATUS
            </button>
            <button
              className="link"
              disabled={!s.manual_status}
              onClick={() => update(s, null)}
            >
              Voltar ao automático
            </button>
            <details>
              <summary>Escolher outro status</summary>
              {STATUSES.map((x) => (
                <button key={x} onClick={() => update(s, x)}>
                  {STATUS_LABELS[x]}
                </button>
              ))}
            </details>
          </section>
        );
      })}
    </main>
  );
}
type Tab = "schedules" | "rooms" | "teachers" | "settings";
function Admin() {
  const { data, refresh } = useData(),
    [pw, setPw] = useState(sessionStorage.getItem("fids-admin") || ""),
    [input, setInput] = useState(""),
    [ok, setOk] = useState(!!pw),
    [tab, setTab] = useState<Tab>("schedules"),
    [error, setError] = useState("");
  const act = async (action: string, payload: unknown) => {
    const { error } = await invokeAdmin(pw, action, payload);
    setError(error ? "Não foi possível salvar. Verifique os dados." : "");
    if (!error) refresh();
  };
  if (!ok)
    return (
      <main className="admin-login shell">
        <Plane />
        <h1>Painel de controle</h1>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const { error } = await invokeAdmin(input, "verify");
            if (error) setError("Senha inválida.");
            else {
              sessionStorage.setItem("fids-admin", input);
              setPw(input);
              setOk(true);
            }
          }}
        >
          <label>
            Senha do administrador
            <input
              type="password"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              required
            />
          </label>
          {error && <p className="error">{error}</p>}
          <button className="primary">ENTRAR</button>
        </form>
      </main>
    );
  return (
    <main className="admin shell">
      <header>
        <div>
          <small>CNA AIRPORT</small>
          <h1>Painel de controle</h1>
        </div>
        <button
          className="link"
          onClick={() => {
            sessionStorage.clear();
            location.reload();
          }}
        >
          SAIR
        </button>
      </header>
      <nav>
        {(["schedules", "rooms", "teachers", "settings"] as Tab[]).map(
          (x, i) => (
            <button key={x} onClick={() => setTab(x)}>
              {["PROGRAMAÇÃO", "SALAS", "PROFESSORES", "CONFIGURAÇÕES"][i]}
            </button>
          ),
        )}
      </nav>
      {error && <p className="error">{error}</p>}
      {tab === "schedules" && <Schedules data={data} act={act} />}{" "}
      {tab === "rooms" && <Rooms data={data} act={act} />}{" "}
      {tab === "teachers" && <Teachers data={data} act={act} />}{" "}
      {tab === "settings" && <SettingsForm data={data} act={act} />}
    </main>
  );
}
const days = [
  "",
  "Segunda",
  "Terça",
  "Quarta",
  "Quinta",
  "Sexta",
  "Sábado",
  "Domingo",
];
type Act = (a: string, p: unknown) => void;
function Schedules({ data, act }: { data: Data; act: Act }) {
  const blank = {
      class_code: "",
      teacher_id: "",
      room_id: "",
      weekday: 6,
      start_time: "08:15",
      end_time: "10:45",
      active_from: "2026-08-01",
      active_until: "2026-12-12",
      enabled: true,
    },
    [f, setF] = useState<any>(blank);
  return (
    <section>
      <h2>Programação</h2>
      <form
        className="admin-form"
        onSubmit={(e) => {
          e.preventDefault();
          act(f.id ? "update_schedule" : "create_schedule", f);
          setF(blank);
        }}
      >
        <label>
          Código
          <input
            value={f.class_code}
            onChange={(e) => setF({ ...f, class_code: e.target.value })}
            required
          />
        </label>
        <label>
          Professor
          <select
            value={f.teacher_id}
            onChange={(e) => setF({ ...f, teacher_id: e.target.value })}
            required
          >
            <option value="" />
            {data.teachers.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Sala
          <select
            value={f.room_id}
            onChange={(e) => setF({ ...f, room_id: e.target.value })}
            required
          >
            <option value="" />
            {data.rooms.map((x) => (
              <option key={x.id} value={x.id}>
                {x.code} — {x.destination}
              </option>
            ))}
          </select>
        </label>
        <label>
          Dia
          <select
            value={f.weekday}
            onChange={(e) => setF({ ...f, weekday: +e.target.value })}
          >
            {days.slice(1).map((x, i) => (
              <option key={x} value={i + 1}>
                {x}
              </option>
            ))}
          </select>
        </label>
        {(
          ["start_time", "end_time", "active_from", "active_until"] as const
        ).map((k) => (
          <label key={k}>
            {k.replaceAll("_", " ")}
            <input
              type={k.includes("time") ? "time" : "date"}
              value={f[k] || ""}
              onChange={(e) => setF({ ...f, [k]: e.target.value })}
            />
          </label>
        ))}
        <button className="primary">SALVAR</button>
      </form>
      <List
        items={data.schedules}
        title={(s: any) => s.class_code + " · " + days[s.weekday]}
        edit={setF}
        toggle={(s) => act("update_schedule", { ...s, enabled: !s.enabled })}
        del={(s) => act("delete_schedule", { id: s.id })}
      />
    </section>
  );
}
function Rooms({ data, act }: { data: Data; act: Act }) {
  const [f, setF] = useState<any>({
    code: "",
    destination: "",
    subtitle: "",
    icon_key: "landmark",
    enabled: true,
  });
  return (
    <section>
      <h2>Salas</h2>
      <form
        className="admin-form"
        onSubmit={(e) => {
          e.preventDefault();
          act(f.id ? "update_room" : "create_room", f);
        }}
      >
        {["code", "destination", "subtitle", "icon_key"].map((k) => (
          <label key={k}>
            {k}
            <input
              value={f[k] || ""}
              onChange={(e) => setF({ ...f, [k]: e.target.value })}
              required={k !== "subtitle"}
            />
          </label>
        ))}
        <button className="primary">SALVAR</button>
      </form>
      <List
        items={data.rooms}
        title={(r: any) => r.code + " — " + r.destination}
        edit={setF}
        toggle={(r) => act("update_room", { ...r, enabled: !r.enabled })}
        del={(r) => act("delete_room", { id: r.id })}
      />
    </section>
  );
}
function Teachers({ data, act }: { data: Data; act: Act }) {
  const [f, setF] = useState<any>({ name: "", enabled: true });
  return (
    <section>
      <h2>Professores</h2>
      <form
        className="admin-form"
        onSubmit={(e) => {
          e.preventDefault();
          act(f.id ? "update_teacher" : "create_teacher", f);
          setF({ name: "", enabled: true });
        }}
      >
        <label>
          Nome
          <input
            value={f.name}
            onChange={(e) => setF({ ...f, name: e.target.value })}
            required
          />
        </label>
        <button className="primary">SALVAR</button>
      </form>
      <List
        items={data.teachers}
        title={(t: any) => t.name}
        edit={setF}
        toggle={(t) => act("update_teacher", { ...t, enabled: !t.enabled })}
        del={(t) => act("delete_teacher", { id: t.id })}
      />
    </section>
  );
}
function List({
  items,
  title,
  edit,
  toggle,
  del,
}: {
  items: any[];
  title: (x: any) => string;
  edit: (x: any) => void;
  toggle: (x: any) => void;
  del: (x: any) => void;
}) {
  return (
    <div className="admin-list">
      {items.map((x) => (
        <article key={x.id}>
          <b>{title(x)}</b>
          <button onClick={() => edit(x)}>Editar</button>
          <button onClick={() => toggle(x)}>
            {x.enabled ? "Desativar" : "Ativar"}
          </button>
          <button className="danger" onClick={() => del(x)}>
            Excluir
          </button>
        </article>
      ))}
    </div>
  );
}
function SettingsForm({ data, act }: { data: Data; act: Act }) {
  const [f, setF] = useState(data.settings);
  useEffect(() => setF(data.settings), [data.settings]);
  return (
    <section>
      <h2>Configurações</h2>
      <form
        className="settings-form"
        onSubmit={(e) => {
          e.preventDefault();
          act("update_settings", f);
        }}
      >
        {Object.entries(f)
          .filter(([k]) => k !== "id")
          .map(([k, v]) => (
            <label key={k}>
              {k.replaceAll("_", " ")}
              <input
                type="number"
                value={v}
                onChange={(e) => setF({ ...f, [k]: +e.target.value })}
              />
            </label>
          ))}
        <button className="primary">SALVAR CONFIGURAÇÕES</button>
      </form>
    </section>
  );
}
export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/board" element={<Board />} />
        <Route path="/staff" element={<Staff />} />
        <Route path="/admin" element={<Admin />} />
        <Route path="*" element={<Navigate to="/board" replace />} />
      </Routes>
    </HashRouter>
  );
}
