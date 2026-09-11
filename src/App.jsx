import React, { useState, useEffect, useMemo, useRef } from "react";
import { supabase } from "./supabaseClient";
import { Plus, X, Check, Droplet, Home, Users, History, Trash2, Edit2, Phone, Mail, MapPin, DollarSign, AlertTriangle, ChevronRight, Clock, Camera, RefreshCw, CircleDollarSign, Bell, UserCircle } from "lucide-react";

const DIAS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
const FRECUENCIAS = ["Semanal", "Quincenal", "Mensual"];

const RANGOS = {
  cloro: { min: 1, max: 3 },
  ph: { min: 7.2, max: 7.6 },
  alcalinidad: { min: 80, max: 120 },
};

function fueraDeRango(campo, valor) {
  if (valor === "" || valor === null || valor === undefined) return false;
  const v = parseFloat(valor);
  const r = RANGOS[campo];
  return v < r.min || v > r.max;
}

function hoyISO() {
  return new Date().toISOString().slice(0, 10);
}

function fechaLegible(iso) {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

function horaLegible(iso) {
  return new Date(iso).toLocaleTimeString("es-PR", { hour: "2-digit", minute: "2-digit" });
}

async function comprimirImagen(file, maxAncho = 1000, calidad = 0.65) {
  const bitmap = await createImageBitmap(file);
  const escala = Math.min(1, maxAncho / bitmap.width);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * escala);
  canvas.height = Math.round(bitmap.height * escala);
  canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", calidad));
}

async function subirFoto(clientId, blob) {
  const ruta = `${clientId}/${Date.now()}.jpg`;
  const { error } = await supabase.storage.from("fotos").upload(ruta, blob, { contentType: "image/jpeg" });
  if (error) throw error;
  const { data } = supabase.storage.from("fotos").getPublicUrl(ruta);
  return data.publicUrl;
}

async function compartirReporte(cliente, visita, tecnicoActual) {
  const lineas = [`Hola ${cliente.nombre}, aquí el reporte de servicio de tu piscina (${fechaLegible(visita.fecha)}):`];
  if (visita.cloro !== "" && visita.cloro != null) lineas.push(`Cloro: ${visita.cloro} ppm`);
  if (visita.ph !== "" && visita.ph != null) lineas.push(`pH: ${visita.ph}`);
  if (visita.alcalinidad !== "" && visita.alcalinidad != null) lineas.push(`Alcalinidad: ${visita.alcalinidad} ppm`);
  if (visita.notas) lineas.push(`Notas: ${visita.notas}`);
  lineas.push(`- ${tecnicoActual || "Tu técnico de piscina"}`);
  const texto = lineas.join("\n");

  try {
    if (visita.foto_url && navigator.canShare) {
      const res = await fetch(visita.foto_url);
      const blob = await res.blob();
      const file = new File([blob], "piscina.jpg", { type: "image/jpeg" });
      if (navigator.canShare({ files: [file] })) {
        await navigator.share({ text: texto, files: [file] });
        return { ok: true };
      }
    }
    if (navigator.share) {
      await navigator.share({ text: texto });
      return { ok: true, sinFoto: true };
    }
    if (cliente.telefono) {
      window.location.href = `sms:${cliente.telefono.replace(/[^0-9+]/g, "")}?body=${encodeURIComponent(texto)}`;
      return { ok: true, sinFoto: true };
    }
    return { ok: false };
  } catch (e) {
    if (e.name === "AbortError") return { ok: "cancelado" };
    return { ok: false };
  }
}

export default function App() {
  const [tab, setTab] = useState("hoy");
  const [clientes, setClientes] = useState([]);
  const [visitas, setVisitas] = useState([]);
  const [tecnicos, setTecnicos] = useState([]);
  const [tecnicoActual, setTecnicoActual] = useState("");
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [recordatorioVisto, setRecordatorioVisto] = useState(false);

  const [modalCliente, setModalCliente] = useState(null);
  const [modalVisita, setModalVisita] = useState(null);
  const [confirmarBorrar, setConfirmarBorrar] = useState(null);
  const [filtroHistorial, setFiltroHistorial] = useState("todos");
  const [modalTecnico, setModalTecnico] = useState(false);

  useEffect(() => {
    cargarTodo();
    const propio = localStorage.getItem("tecnico-actual");
    if (propio) setTecnicoActual(propio);
    else setModalTecnico(true);
  }, []);

  async function cargarTodo() {
    setCargando(true);
    try {
      const [c, v, t] = await Promise.all([
        supabase.from("clients").select("*").order("nombre"),
        supabase.from("visits").select("*"),
        supabase.from("technicians").select("nombre"),
      ]);
      if (c.error) throw c.error;
      if (v.error) throw v.error;
      if (t.error) throw t.error;
      setClientes(c.data);
      setVisitas(v.data);
      setTecnicos(t.data.map((x) => x.nombre));
    } catch (e) {
      setError("No se pudo conectar con la base de datos. Revisa tu conexión o la configuración de Supabase.");
    } finally {
      setCargando(false);
    }
  }

  function guardarTecnicoActual(nombre) {
    setTecnicoActual(nombre);
    localStorage.setItem("tecnico-actual", nombre);
    if (nombre && !tecnicos.includes(nombre)) {
      supabase.from("technicians").insert({ nombre }).then(() => setTecnicos((t) => [...t, nombre]));
    }
    setModalTecnico(false);
  }

  const diaHoy = new Date().getDay();
  const horaActual = new Date().getHours();

  const rutaHoy = useMemo(() => clientes.filter((c) => c.dia_servicio === diaHoy), [clientes, diaHoy]);

  const visitasHoyPorCliente = useMemo(() => {
    const map = {};
    visitas.forEach((v) => { if (v.fecha === hoyISO()) map[v.client_id] = v; });
    return map;
  }, [visitas]);

  const pendientesTarde = rutaHoy.filter((c) => !visitasHoyPorCliente[c.id]?.completada);

  const ingresoMensualEstimado = useMemo(() => {
    return clientes.reduce((sum, c) => {
      const tarifa = parseFloat(c.tarifa) || 0;
      if (c.frecuencia === "Semanal") return sum + tarifa * 4;
      if (c.frecuencia === "Quincenal") return sum + tarifa * 2;
      return sum + tarifa;
    }, 0);
  }, [clientes]);

  const pendienteDeCobro = useMemo(() => visitas.filter((v) => v.completada && v.estado_pago === "pendiente"), [visitas]);
  const totalPendienteCobro = pendienteDeCobro.reduce((s, v) => s + (parseFloat(v.monto) || 0), 0);
  const totalCobradoMes = visitas
    .filter((v) => v.completada && v.estado_pago === "cobrado" && v.fecha.slice(0, 7) === hoyISO().slice(0, 7))
    .reduce((s, v) => s + (parseFloat(v.monto) || 0), 0);

  function abrirNuevoCliente() {
    setModalCliente({ id: null, nombre: "", direccion: "", telefono: "", email: "", frecuencia: "Semanal", dia_servicio: diaHoy, tarifa: "", notas: "" });
  }

  async function guardarCliente(datos) {
    if (!datos.nombre.trim()) { setError("El nombre del cliente es requerido."); return; }
    setError("");
    const payload = { ...datos };
    delete payload.id;
    try {
      if (datos.id) {
        const { error } = await supabase.from("clients").update(payload).eq("id", datos.id);
        if (error) throw error;
        setClientes((cs) => cs.map((c) => (c.id === datos.id ? { ...c, ...payload } : c)));
      } else {
        const { data, error } = await supabase.from("clients").insert(payload).select().single();
        if (error) throw error;
        setClientes((cs) => [...cs, data].sort((a, b) => a.nombre.localeCompare(b.nombre)));
      }
      setModalCliente(null);
    } catch (e) {
      setError("No se pudo guardar el cliente.");
    }
  }

  async function borrarCliente(id) {
    try {
      const { error } = await supabase.from("clients").delete().eq("id", id);
      if (error) throw error;
      setClientes((cs) => cs.filter((c) => c.id !== id));
    } catch (e) {
      setError("No se pudo borrar el cliente.");
    }
    setConfirmarBorrar(null);
  }

  async function guardarVisita(datos, archivoFoto) {
    setError("");
    if (datos.completada && !datos.foto_url && !archivoFoto) {
      setError("Toma la foto de la piscina antes de completar la visita.");
      return false;
    }
    try {
      let foto_url = datos.foto_url;
      let foto_hora = datos.foto_hora;
      if (archivoFoto) {
        const blob = await comprimirImagen(archivoFoto);
        foto_url = await subirFoto(datos.client_id, blob);
        foto_hora = new Date().toISOString();
      }
      const payload = { ...datos, foto_url, foto_hora };
      delete payload.id;

      const { data, error } = await supabase
        .from("visits")
        .upsert(payload, { onConflict: "client_id,fecha" })
        .select()
        .single();
      if (error) throw error;

      setVisitas((vs) => {
        const sinEsta = vs.filter((v) => !(v.client_id === data.client_id && v.fecha === data.fecha));
        return [...sinEsta, data];
      });
      return data;
    } catch (e) {
      setError("No se pudo guardar la visita. Intenta de nuevo.");
      return false;
    }
  }

  async function marcarCobrado(visitaId) {
    try {
      const { error } = await supabase.from("visits").update({ estado_pago: "cobrado" }).eq("id", visitaId);
      if (error) throw error;
      setVisitas((vs) => vs.map((v) => (v.id === visitaId ? { ...v, estado_pago: "cobrado" } : v)));
    } catch (e) {
      setError("No se pudo actualizar el cobro.");
    }
  }

  if (cargando) {
    return <div className="flex items-center justify-center min-h-screen text-slate-400 text-sm">Cargando datos de la ruta...</div>;
  }

  return (
    <div className="max-w-md mx-auto bg-slate-50 min-h-screen flex flex-col font-sans">
      <header className="bg-teal-800 text-white px-4 pt-5 pb-4 sticky top-0 z-20">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Droplet className="w-6 h-6 text-teal-300" strokeWidth={2.5} />
            <h1 className="text-lg font-semibold tracking-tight">Ruta de Piscinas</h1>
          </div>
          <button onClick={() => setModalTecnico(true)} className="flex items-center gap-1.5 bg-teal-700/60 rounded-full pl-2 pr-3 py-1">
            <UserCircle className="w-4 h-4 text-teal-200" />
            <span className="text-xs text-teal-100">{tecnicoActual || "Técnico"}</span>
          </button>
        </div>
        <p className="text-teal-200 text-xs mt-1">{DIAS[diaHoy]}, {fechaLegible(hoyISO())}</p>
      </header>

      {error && (
        <div className="bg-red-50 border-b border-red-200 text-red-700 text-xs px-4 py-2 flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError("")} className="text-red-400"><X className="w-3.5 h-3.5" /></button>
        </div>
      )}

      {!recordatorioVisto && horaActual >= 15 && pendientesTarde.length > 0 && (
        <div className="bg-amber-50 border-b border-amber-200 text-amber-800 text-xs px-4 py-2.5 flex items-center justify-between gap-2">
          <span className="flex items-center gap-1.5"><Bell className="w-3.5 h-3.5 shrink-0" /> Quedan {pendientesTarde.length} visita(s) sin completar hoy.</span>
          <button onClick={() => setRecordatorioVisto(true)} className="text-amber-500 shrink-0"><X className="w-3.5 h-3.5" /></button>
        </div>
      )}

      <main className="flex-1 overflow-y-auto pb-20">
        {tab === "hoy" && (
          <RutaHoy rutaHoy={rutaHoy} visitasHoyPorCliente={visitasHoyPorCliente} clientes={clientes} ingresoMensualEstimado={ingresoMensualEstimado} onAbrirVisita={(c) => setModalVisita(c)} />
        )}
        {tab === "clientes" && (
          <Clientes clientes={clientes} onNuevo={abrirNuevoCliente} onEditar={(c) => setModalCliente(c)} onBorrar={(id) => setConfirmarBorrar(id)} />
        )}
        {tab === "cobros" && (
          <Cobros pendienteDeCobro={pendienteDeCobro} clientes={clientes} totalPendienteCobro={totalPendienteCobro} totalCobradoMes={totalCobradoMes} onCobrar={marcarCobrado} />
        )}
        {tab === "historial" && (
          <Historial visitas={visitas} clientes={clientes} filtro={filtroHistorial} setFiltro={setFiltroHistorial} tecnicoActual={tecnicoActual} />
        )}
      </main>

      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 max-w-md mx-auto flex">
        <TabButton icon={Home} label="Hoy" active={tab === "hoy"} onClick={() => setTab("hoy")} badge={rutaHoy.length} />
        <TabButton icon={Users} label="Clientes" active={tab === "clientes"} onClick={() => setTab("clientes")} />
        <TabButton icon={CircleDollarSign} label="Cobros" active={tab === "cobros"} onClick={() => setTab("cobros")} badge={pendienteDeCobro.length} />
        <TabButton icon={History} label="Historial" active={tab === "historial"} onClick={() => setTab("historial")} />
      </nav>

      {modalCliente && <ModalCliente cliente={modalCliente} onGuardar={guardarCliente} onCerrar={() => { setModalCliente(null); setError(""); }} />}

      {modalVisita && (
        <ModalVisita
          cliente={modalVisita}
          visitaExistente={visitasHoyPorCliente[modalVisita.id]}
          tecnicoActual={tecnicoActual}
          onGuardar={guardarVisita}
          onCerrar={() => { setModalVisita(null); setError(""); }}
          onError={setError}
        />
      )}

      {confirmarBorrar && (
        <ModalConfirmar mensaje="¿Borrar este cliente? Su historial de visitas también se borra." onConfirmar={() => borrarCliente(confirmarBorrar)} onCancelar={() => setConfirmarBorrar(null)} />
      )}

      {modalTecnico && <ModalTecnico actual={tecnicoActual} sugeridos={tecnicos} onGuardar={guardarTecnicoActual} onCerrar={() => setModalTecnico(false)} puedeCerrar={!!tecnicoActual} />}
    </div>
  );
}

function TabButton({ icon: Icon, label, active, onClick, badge }) {
  return (
    <button onClick={onClick} className={`flex-1 flex flex-col items-center gap-0.5 py-2.5 relative ${active ? "text-teal-700" : "text-slate-400"}`}>
      <Icon className="w-5 h-5" strokeWidth={active ? 2.5 : 2} />
      <span className={`text-[11px] ${active ? "font-medium" : ""}`}>{label}</span>
      {badge > 0 && <span className="absolute top-1 right-[calc(50%-24px)] bg-orange-600 text-white text-[10px] rounded-full w-4 h-4 flex items-center justify-center">{badge}</span>}
    </button>
  );
}

function RutaHoy({ rutaHoy, visitasHoyPorCliente, clientes, ingresoMensualEstimado, onAbrirVisita }) {
  const completadas = rutaHoy.filter((c) => visitasHoyPorCliente[c.id]?.completada).length;
  return (
    <div className="px-4 pt-4">
      <div className="grid grid-cols-2 gap-3 mb-5">
        <div className="bg-white rounded-xl p-3 border border-slate-200">
          <p className="text-[11px] text-slate-400">Visitas hoy</p>
          <p className="text-xl font-semibold text-slate-800">{completadas}/{rutaHoy.length}</p>
        </div>
        <div className="bg-white rounded-xl p-3 border border-slate-200">
          <p className="text-[11px] text-slate-400">Clientes activos</p>
          <p className="text-xl font-semibold text-slate-800">{clientes.length}</p>
        </div>
      </div>

      {rutaHoy.length === 0 ? (
        <div className="text-center py-16 text-slate-400">
          <Droplet className="w-8 h-8 mx-auto mb-2 text-slate-300" />
          <p className="text-sm">No hay visitas programadas para hoy.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {rutaHoy.map((c) => {
            const v = visitasHoyPorCliente[c.id];
            return (
              <button key={c.id} onClick={() => onAbrirVisita(c)} className="w-full bg-white rounded-xl p-3.5 border border-slate-200 flex items-center gap-3 text-left active:scale-[0.99] transition">
                <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${v?.completada ? "bg-teal-100 text-teal-700" : "bg-slate-100 text-slate-400"}`}>
                  {v?.completada ? <Check className="w-4.5 h-4.5" /> : <Droplet className="w-4.5 h-4.5" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-800 truncate">{c.nombre}</p>
                  <p className="text-xs text-slate-400 truncate">{c.direccion || "Sin dirección"}</p>
                </div>
                {v?.completada ? <span className="text-[11px] text-teal-700 font-medium shrink-0">Hecho</span> : <ChevronRight className="w-4 h-4 text-slate-300 shrink-0" />}
              </button>
            );
          })}
        </div>
      )}

      <div className="bg-white rounded-xl p-3.5 border border-slate-200 mt-5 flex items-center justify-between">
        <div>
          <p className="text-[11px] text-slate-400">Ingreso mensual estimado</p>
          <p className="text-lg font-semibold text-slate-800">${ingresoMensualEstimado.toFixed(2)}</p>
        </div>
        <DollarSign className="w-5 h-5 text-teal-600" />
      </div>
    </div>
  );
}

function Clientes({ clientes, onNuevo, onEditar, onBorrar }) {
  return (
    <div className="px-4 pt-4">
      <button onClick={onNuevo} className="w-full bg-teal-700 text-white rounded-xl py-3 flex items-center justify-center gap-2 text-sm font-medium mb-4 active:scale-[0.99] transition">
        <Plus className="w-4 h-4" /> Añadir cliente
      </button>
      {clientes.length === 0 ? (
        <p className="text-center text-sm text-slate-400 py-10">Aún no tienes clientes. Añade el primero.</p>
      ) : (
        <div className="space-y-2">
          {clientes.map((c) => (
            <div key={c.id} className="bg-white rounded-xl p-3.5 border border-slate-200">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-800 truncate">{c.nombre}</p>
                  {c.direccion && <p className="text-xs text-slate-400 flex items-center gap-1 mt-0.5"><MapPin className="w-3 h-3 shrink-0" /> <span className="truncate">{c.direccion}</span></p>}
                  {c.telefono && <p className="text-xs text-slate-400 flex items-center gap-1 mt-0.5"><Phone className="w-3 h-3 shrink-0" /> {c.telefono}</p>}
                  {c.email && <p className="text-xs text-slate-400 flex items-center gap-1 mt-0.5"><Mail className="w-3 h-3 shrink-0" /> {c.email}</p>}
                  <p className="text-xs text-teal-700 mt-1">{c.frecuencia} · {DIAS[c.dia_servicio]} · ${parseFloat(c.tarifa || 0).toFixed(2)}</p>
                </div>
                <div className="flex gap-1 shrink-0">
                  <button onClick={() => onEditar(c)} className="p-1.5 text-slate-400 hover:text-teal-700"><Edit2 className="w-3.5 h-3.5" /></button>
                  <button onClick={() => onBorrar(c.id)} className="p-1.5 text-slate-400 hover:text-red-600"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Cobros({ pendienteDeCobro, clientes, totalPendienteCobro, totalCobradoMes, onCobrar }) {
  return (
    <div className="px-4 pt-4">
      <div className="grid grid-cols-2 gap-3 mb-5">
        <div className="bg-white rounded-xl p-3 border border-slate-200">
          <p className="text-[11px] text-slate-400">Pendiente de cobro</p>
          <p className="text-xl font-semibold text-amber-600">${totalPendienteCobro.toFixed(2)}</p>
        </div>
        <div className="bg-white rounded-xl p-3 border border-slate-200">
          <p className="text-[11px] text-slate-400">Cobrado este mes</p>
          <p className="text-xl font-semibold text-teal-700">${totalCobradoMes.toFixed(2)}</p>
        </div>
      </div>
      {pendienteDeCobro.length === 0 ? (
        <p className="text-center text-sm text-slate-400 py-10">No hay cobros pendientes.</p>
      ) : (
        <div className="space-y-2">
          {pendienteDeCobro.map((v) => {
            const cliente = clientes.find((c) => c.id === v.client_id);
            return (
              <div key={v.id} className="bg-white rounded-xl p-3.5 border border-slate-200 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-800 truncate">{cliente?.nombre || "Cliente eliminado"}</p>
                  <p className="text-xs text-slate-400">{fechaLegible(v.fecha)} · ${parseFloat(v.monto || 0).toFixed(2)}</p>
                </div>
                <button onClick={() => onCobrar(v.id)} className="bg-teal-700 text-white text-xs font-medium rounded-lg px-3 py-2 shrink-0">Marcar cobrado</button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Historial({ visitas, clientes, filtro, setFiltro, tecnicoActual }) {
  const [fotoAmpliada, setFotoAmpliada] = useState(null);
  const [enviandoId, setEnviandoId] = useState(null);
  const completadas = visitas.filter((v) => v.completada).filter((v) => filtro === "todos" || v.client_id === filtro).sort((a, b) => (a.fecha < b.fecha ? 1 : -1));

  async function reenviar(cliente, visita) {
    setEnviandoId(visita.id);
    await compartirReporte(cliente, visita, tecnicoActual);
    setEnviandoId(null);
  }

  return (
    <div className="px-4 pt-4">
      <select value={filtro} onChange={(e) => setFiltro(e.target.value)} className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-sm mb-4 text-slate-700">
        <option value="todos">Todos los clientes</option>
        {clientes.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
      </select>

      {completadas.length === 0 ? (
        <p className="text-center text-sm text-slate-400 py-10">Sin visitas registradas todavía.</p>
      ) : (
        <div className="space-y-2">
          {completadas.map((v) => {
            const cliente = clientes.find((c) => c.id === v.client_id);
            const alerta = fueraDeRango("cloro", v.cloro) || fueraDeRango("ph", v.ph) || fueraDeRango("alcalinidad", v.alcalinidad);
            return (
              <div key={v.id} className="bg-white rounded-xl p-3.5 border border-slate-200">
                <div className="flex gap-3">
                  {v.foto_url && (
                    <button onClick={() => setFotoAmpliada(v.foto_url)} className="shrink-0">
                      <img src={v.foto_url} alt={`Foto de la piscina de ${cliente?.nombre || "cliente"}`} className="w-14 h-14 rounded-lg object-cover border border-slate-200" />
                    </button>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-sm font-medium text-slate-800 truncate">{cliente?.nombre || "Cliente eliminado"}</p>
                      <span className="text-xs text-slate-400 flex items-center gap-1 shrink-0"><Clock className="w-3 h-3" />{fechaLegible(v.fecha)}</span>
                    </div>
                    <div className="flex gap-3 text-xs text-slate-500 flex-wrap">
                      {v.cloro != null && <span className={fueraDeRango("cloro", v.cloro) ? "text-amber-600 font-medium" : ""}>Cloro {v.cloro} ppm</span>}
                      {v.ph != null && <span className={fueraDeRango("ph", v.ph) ? "text-amber-600 font-medium" : ""}>pH {v.ph}</span>}
                      {v.alcalinidad != null && <span className={fueraDeRango("alcalinidad", v.alcalinidad) ? "text-amber-600 font-medium" : ""}>Alc. {v.alcalinidad} ppm</span>}
                    </div>
                    <p className="text-[11px] text-slate-400 mt-1">
                      {v.tecnico && <>Técnico: {v.tecnico} · </>}
                      <span className={v.estado_pago === "cobrado" ? "text-teal-700" : "text-amber-600"}>{v.estado_pago === "cobrado" ? "Cobrado" : "Pendiente de cobro"}</span>
                    </p>
                  </div>
                </div>
                {alerta && <p className="text-[11px] text-amber-600 flex items-center gap-1 mt-1.5"><AlertTriangle className="w-3 h-3" /> Lectura fuera de rango</p>}
                {v.notas && <p className="text-xs text-slate-500 mt-1.5 italic">"{v.notas}"</p>}
                {v.foto_url && cliente && (
                  <button onClick={() => reenviar(cliente, v)} disabled={enviandoId === v.id} className="text-[11px] text-teal-700 font-medium mt-2">
                    {enviandoId === v.id ? "Abriendo..." : "Reenviar al cliente"}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {fotoAmpliada && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-6" onClick={() => setFotoAmpliada(null)}>
          <img src={fotoAmpliada} alt="Foto de la piscina ampliada" className="max-w-full max-h-full rounded-lg" />
        </div>
      )}
    </div>
  );
}

function Campo({ label, children }) {
  return (
    <label className="block mb-3">
      <span className="text-xs font-medium text-slate-500 mb-1 block">{label}</span>
      {children}
    </label>
  );
}

const inputClase = "w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-200 focus:border-teal-400";

function ModalCliente({ cliente, onGuardar, onCerrar }) {
  const [datos, setDatos] = useState(cliente);
  const set = (k, v) => setDatos((d) => ({ ...d, [k]: v }));
  return (
    <Overlay onCerrar={onCerrar} titulo={cliente.id ? "Editar cliente" : "Nuevo cliente"}>
      <Campo label="Nombre"><input className={inputClase} value={datos.nombre} onChange={(e) => set("nombre", e.target.value)} placeholder="Nombre del cliente" /></Campo>
      <Campo label="Dirección"><input className={inputClase} value={datos.direccion} onChange={(e) => set("direccion", e.target.value)} placeholder="Dirección de la piscina" /></Campo>
      <Campo label="Teléfono"><input className={inputClase} value={datos.telefono} onChange={(e) => set("telefono", e.target.value)} placeholder="787-000-0000" /></Campo>
      <Campo label="Email"><input className={inputClase} type="email" value={datos.email || ""} onChange={(e) => set("email", e.target.value)} placeholder="cliente@correo.com" /></Campo>
      <div className="grid grid-cols-2 gap-3">
        <Campo label="Frecuencia">
          <select className={inputClase} value={datos.frecuencia} onChange={(e) => set("frecuencia", e.target.value)}>
            {FRECUENCIAS.map((f) => <option key={f} value={f}>{f}</option>)}
          </select>
        </Campo>
        <Campo label="Día de servicio">
          <select className={inputClase} value={datos.dia_servicio} onChange={(e) => set("dia_servicio", parseInt(e.target.value))}>
            {DIAS.map((d, i) => <option key={d} value={i}>{d}</option>)}
          </select>
        </Campo>
      </div>
      <Campo label="Tarifa por visita ($)"><input className={inputClase} type="number" min="0" step="0.01" value={datos.tarifa} onChange={(e) => set("tarifa", e.target.value)} placeholder="0.00" /></Campo>
      <Campo label="Notas"><textarea className={inputClase} rows={2} value={datos.notas} onChange={(e) => set("notas", e.target.value)} placeholder="Acceso, equipo, alergias a químicos, etc." /></Campo>
      <button onClick={() => onGuardar(datos)} className="w-full bg-teal-700 text-white rounded-lg py-3 text-sm font-medium mt-2">Guardar cliente</button>
    </Overlay>
  );
}

function ModalVisita({ cliente, visitaExistente, tecnicoActual, onGuardar, onCerrar, onError }) {
  const [datos, setDatos] = useState(
    visitaExistente || {
      client_id: cliente.id, fecha: hoyISO(), cloro: "", ph: "", alcalinidad: "",
      cepillado: false, aspirado: false, skimmer: false, notas: "", completada: false,
      foto_url: null, foto_hora: null, estado_pago: "pendiente", monto: cliente.tarifa || "", tecnico: tecnicoActual || "",
    }
  );
  const [archivoFoto, setArchivoFoto] = useState(null);
  const [previewFoto, setPreviewFoto] = useState(visitaExistente?.foto_url || null);
  const [tomandoFoto, setTomandoFoto] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [paso, setPaso] = useState("formulario");
  const [enviando, setEnviando] = useState(false);
  const [resultadoEnvio, setResultadoEnvio] = useState(null);
  const inputFotoRef = useRef(null);
  const set = (k, v) => setDatos((d) => ({ ...d, [k]: v }));

  function manejarFoto(e) {
    const archivo = e.target.files?.[0];
    if (!archivo) return;
    setArchivoFoto(archivo);
    setPreviewFoto(URL.createObjectURL(archivo));
    e.target.value = "";
  }

  async function completar() {
    setGuardando(true);
    const resultado = await onGuardar({ ...datos, completada: true }, archivoFoto);
    setGuardando(false);
    if (resultado) setPaso("enviar");
  }

  async function enviarAhora() {
    setEnviando(true);
    const r = await compartirReporte(cliente, datos, tecnicoActual);
    setResultadoEnvio(r);
    setEnviando(false);
  }

  if (paso === "enviar") {
    return (
      <Overlay onCerrar={onCerrar} titulo="Visita completada">
        <div className="text-center py-2">
          <div className="w-12 h-12 bg-teal-100 text-teal-700 rounded-full flex items-center justify-center mx-auto mb-3"><Check className="w-6 h-6" /></div>
          <p className="text-sm text-slate-600 mb-5">Envía la foto y las lecturas a {cliente.nombre} por mensaje de texto o WhatsApp.</p>
          <button onClick={enviarAhora} disabled={enviando} className="w-full bg-teal-700 text-white rounded-lg py-3 text-sm font-medium mb-2">
            {enviando ? "Abriendo..." : "Enviar al cliente"}
          </button>
          {resultadoEnvio?.ok === true && resultadoEnvio.sinFoto && <p className="text-[11px] text-amber-600 mb-2">Se abrió el mensaje solo con el texto — adjunta la foto a mano si tu teléfono no lo permitió automático.</p>}
          {resultadoEnvio?.ok === false && <p className="text-[11px] text-red-500 mb-2">Este dispositivo no permite compartir directamente. Ve al Historial para descargar la foto.</p>}
          {resultadoEnvio?.ok === "cancelado" && <p className="text-[11px] text-slate-400 mb-2">Se canceló el envío.</p>}
          <button onClick={onCerrar} className="w-full border border-slate-200 rounded-lg py-2.5 text-sm text-slate-500 mt-1">Listo, sin enviar</button>
        </div>
      </Overlay>
    );
  }

  return (
    <Overlay onCerrar={onCerrar} titulo={cliente.nombre}>
      <p className="text-xs text-slate-400 mb-3">{cliente.direccion}</p>

      <Campo label="Foto de la piscina (obligatoria, tomada en el momento)">
        {previewFoto ? (
          <div className="relative">
            <img src={previewFoto} alt="Foto tomada de la piscina" className="w-full h-40 object-cover rounded-lg border border-slate-200" />
            <button onClick={() => inputFotoRef.current?.click()} className="absolute top-2 right-2 bg-white/90 rounded-full p-1.5 text-slate-600 flex items-center gap-1 text-[11px] font-medium px-2.5">
              <RefreshCw className="w-3 h-3" /> Repetir
            </button>
          </div>
        ) : (
          <button onClick={() => inputFotoRef.current?.click()} disabled={tomandoFoto} className="w-full border-2 border-dashed border-slate-300 rounded-lg py-6 flex flex-col items-center gap-1.5 text-slate-400">
            <Camera className="w-6 h-6" />
            <span className="text-xs">Tomar foto ahora</span>
          </button>
        )}
        <input ref={inputFotoRef} type="file" accept="image/*" capture="environment" onChange={manejarFoto} className="hidden" />
      </Campo>

      <div className="grid grid-cols-3 gap-2 mb-1">
        <Campo label="Cloro (ppm)"><input className={inputClase} type="number" step="0.1" value={datos.cloro} onChange={(e) => set("cloro", e.target.value)} placeholder="1-3" /></Campo>
        <Campo label="pH"><input className={inputClase} type="number" step="0.1" value={datos.ph} onChange={(e) => set("ph", e.target.value)} placeholder="7.2-7.6" /></Campo>
        <Campo label="Alcalinidad"><input className={inputClase} type="number" step="1" value={datos.alcalinidad} onChange={(e) => set("alcalinidad", e.target.value)} placeholder="80-120" /></Campo>
      </div>

      {(fueraDeRango("cloro", datos.cloro) || fueraDeRango("ph", datos.ph) || fueraDeRango("alcalinidad", datos.alcalinidad)) && (
        <p className="text-[11px] text-amber-600 flex items-center gap-1 mb-3 mt-1"><AlertTriangle className="w-3 h-3" /> Una o más lecturas están fuera del rango recomendado.</p>
      )}

      <div className="flex gap-4 mb-4 mt-2">
        {[["cepillado", "Cepillado"], ["aspirado", "Aspirado"], ["skimmer", "Skimmer"]].map(([k, label]) => (
          <label key={k} className="flex items-center gap-1.5 text-xs text-slate-600">
            <input type="checkbox" checked={datos[k]} onChange={(e) => set(k, e.target.checked)} className="w-4 h-4 accent-teal-700" />
            {label}
          </label>
        ))}
      </div>

      <Campo label="Monto a cobrar ($)"><input className={inputClase} type="number" min="0" step="0.01" value={datos.monto} onChange={(e) => set("monto", e.target.value)} /></Campo>
      <Campo label="Notas de la visita"><textarea className={inputClase} rows={2} value={datos.notas} onChange={(e) => set("notas", e.target.value)} placeholder="Observaciones, equipo dañado, etc." /></Campo>

      <button onClick={completar} disabled={guardando} className="w-full bg-teal-700 text-white rounded-lg py-3 text-sm font-medium mt-2 flex items-center justify-center gap-2">
        <Check className="w-4 h-4" /> {guardando ? "Guardando..." : "Marcar visita completada"}
      </button>
    </Overlay>
  );
}

function ModalTecnico({ actual, sugeridos, onGuardar, onCerrar, puedeCerrar }) {
  const [nombre, setNombre] = useState(actual || "");
  return (
    <Overlay onCerrar={puedeCerrar ? onCerrar : undefined} titulo="¿Quién eres?">
      <p className="text-xs text-slate-400 mb-3">Tu nombre queda registrado en cada visita que completes.</p>
      <Campo label="Tu nombre"><input className={inputClase} value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej. Omar" autoFocus /></Campo>
      {sugeridos.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-4">
          {sugeridos.map((s) => <button key={s} onClick={() => setNombre(s)} className="text-xs bg-slate-100 text-slate-600 rounded-full px-3 py-1.5">{s}</button>)}
        </div>
      )}
      <button onClick={() => nombre.trim() && onGuardar(nombre.trim())} className="w-full bg-teal-700 text-white rounded-lg py-3 text-sm font-medium">Continuar</button>
    </Overlay>
  );
}

function ModalConfirmar({ mensaje, onConfirmar, onCancelar }) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-end justify-center z-50">
      <div className="bg-white rounded-t-2xl w-full max-w-md p-5">
        <p className="text-sm text-slate-700 mb-4">{mensaje}</p>
        <div className="flex gap-2">
          <button onClick={onCancelar} className="flex-1 border border-slate-200 rounded-lg py-2.5 text-sm text-slate-600">Cancelar</button>
          <button onClick={onConfirmar} className="flex-1 bg-red-600 text-white rounded-lg py-2.5 text-sm">Borrar</button>
        </div>
      </div>
    </div>
  );
}

function Overlay({ titulo, children, onCerrar }) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-end justify-center z-50">
      <div className="bg-white rounded-t-2xl w-full max-w-md max-h-[90vh] overflow-y-auto p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-slate-800">{titulo}</h2>
          {onCerrar && <button onClick={onCerrar} className="text-slate-400"><X className="w-5 h-5" /></button>}
        </div>
        {children}
      </div>
    </div>
  );
}
