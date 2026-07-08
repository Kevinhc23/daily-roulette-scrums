"use client"

import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from "react"
import { Badge, Button } from "@cloudflare/kumo"
import { Role, TeamnName, type User } from "@/generated/prisma/browser"

type ApiResponse<T> = {
  success?: boolean
  data?: T
  message?: string
}

type UserStatus = {
  blocked: boolean
  unavailable: boolean
  note: string
  startedAt?: string
  updatedAt: string
}

type UserStatusMap = Record<string, UserStatus>

type CreateUserForm = {
  name: string
  email: string
  role: Role
  team: TeamnName
}

const STORAGE_KEY = "daily-roulette-status-v1"
const DRAWN_STORAGE_KEY = "daily-roulette-drawn-v1"
const spinDurationMs = 1800
const spinTickMs = 85

const teamOptions = Object.values(TeamnName)
const roleOptions = Object.values(Role)

const initialForm: CreateUserForm = {
  name: "",
  email: "",
  role: Role.Developer,
  team: TeamnName.Martech,
}

function formatDate(value?: string) {
  if (!value) return "Sin fecha"
  return new Intl.DateTimeFormat("es-EC", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value))
}

export default function Home() {
  const [users, setUsers] = useState<User[]>([])
  const [loadingUsers, setLoadingUsers] = useState(true)
  const [loadingAction, setLoadingAction] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedTeam, setSelectedTeam] = useState<TeamnName | "ALL">("ALL")
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [spinningName, setSpinningName] = useState("Listo para girar")
  const [isSpinning, setIsSpinning] = useState(false)
  const [statusMap, setStatusMap] = useState<UserStatusMap>({})
  const [drawnUserIds, setDrawnUserIds] = useState<string[]>([])
  const [form, setForm] = useState<CreateUserForm>(initialForm)

  const intervalRef = useRef<number | null>(null)
  const timeoutRef = useRef<number | null>(null)
  const noteRef = useRef<HTMLTextAreaElement | null>(null)
  const hasLoadedStatusRef = useRef(false)
  const hasLoadedDrawnRef = useRef(false)

  const filteredUsers = useMemo(() => {
    if (selectedTeam === "ALL") return users
    return users.filter((user) => user.team === selectedTeam)
  }, [selectedTeam, users])
  const eligibleUsers = useMemo(
    () =>
      filteredUsers.filter(
        (user) => !drawnUserIds.includes(user.id) && !statusMap[user.id]?.unavailable,
      ),
    [drawnUserIds, filteredUsers, statusMap],
  )

  const currentUser = useMemo(
    () => users.find((user) => user.id === currentUserId) ?? null,
    [currentUserId, users],
  )

  const currentStatus = currentUser ? statusMap[currentUser.id] : undefined
  const blockedUsers = useMemo(
    () => users.filter((user) => statusMap[user.id]?.blocked),
    [statusMap, users],
  )
  const noteEntries = useMemo(
    () =>
      users
        .map((user) => ({ user, status: statusMap[user.id] }))
        .filter(({ status }) =>
          Boolean(status?.note || status?.blocked || status?.unavailable || status?.startedAt),
        )
        .sort(
          (left, right) =>
            left.user.team.localeCompare(right.user.team) ||
            left.user.name.localeCompare(right.user.name),
        ),
    [statusMap, users],
  )

  const clearSpinTimers = () => {
    if (intervalRef.current !== null) {
      window.clearInterval(intervalRef.current)
      intervalRef.current = null
    }
    if (timeoutRef.current !== null) {
      window.clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
  }

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      const raw = window.localStorage.getItem(STORAGE_KEY)
      hasLoadedStatusRef.current = true
      if (!raw) return

      try {
        const parsed = JSON.parse(raw) as UserStatusMap
        setStatusMap(parsed)
      } catch {
        window.localStorage.removeItem(STORAGE_KEY)
      }
    }, 0)

    return () => {
      window.clearTimeout(timeout)
    }
  }, [])

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      const raw = window.localStorage.getItem(DRAWN_STORAGE_KEY)
      hasLoadedDrawnRef.current = true
      if (!raw) return

      try {
        const parsed = JSON.parse(raw) as string[]
        setDrawnUserIds(parsed)
      } catch {
        window.localStorage.removeItem(DRAWN_STORAGE_KEY)
      }
    }, 0)

    return () => {
      window.clearTimeout(timeout)
    }
  }, [])

  useEffect(() => {
    if (!hasLoadedStatusRef.current) return
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(statusMap))
  }, [statusMap])

  useEffect(() => {
    if (!hasLoadedDrawnRef.current) return
    window.localStorage.setItem(DRAWN_STORAGE_KEY, JSON.stringify(drawnUserIds))
  }, [drawnUserIds])

  useEffect(() => {
    let active = true

    const loadUsers = async () => {
      setLoadingUsers(true)
      setError(null)

      try {
        const response = await fetch("/api/users", { cache: "no-store" })
        const payload = (await response.json()) as ApiResponse<User[]>

        if (!response.ok || !payload.success) {
          throw new Error(payload.message ?? "No se pudo cargar la lista")
        }

        if (!active) return
        const nextUsers = payload.data ?? []
        setUsers(nextUsers)
        setCurrentUserId((current) => {
          if (current && nextUsers.some((user) => user.id === current)) {
            return current
          }
          return null
        })
        setDrawnUserIds((current) => current.filter((id) => nextUsers.some((user) => user.id === id)))
      } catch (fetchError) {
        if (!active) return
        setError(fetchError instanceof Error ? fetchError.message : "Error desconocido")
      } finally {
        if (active) {
          setLoadingUsers(false)
        }
      }
    }

    void loadUsers()

    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    return () => {
      clearSpinTimers()
    }
  }, [])

  const refreshUsers = async (preferredUserId?: string | null) => {
    const response = await fetch("/api/users", { cache: "no-store" })
    const payload = (await response.json()) as ApiResponse<User[]>

    if (!response.ok || !payload.success) {
      throw new Error(payload.message ?? "No se pudo refrescar la lista")
    }

    const nextUsers = payload.data ?? []
    setUsers(nextUsers)
    setDrawnUserIds((current) => current.filter((id) => nextUsers.some((user) => user.id === id)))
    setCurrentUserId((current) => {
      if (preferredUserId && nextUsers.some((user) => user.id === preferredUserId)) {
        return preferredUserId
      }

      if (current && nextUsers.some((user) => user.id === current)) {
        return current
      }

      return null
    })
  }

  const updateStatus = (patch: Partial<UserStatus>) => {
    if (!currentUser) return

        setStatusMap((current) => {
          const previous = current[currentUser.id] ?? {
            blocked: false,
            unavailable: false,
            note: "",
            updatedAt: new Date().toISOString(),
          }

      return {
        ...current,
        [currentUser.id]: {
          ...previous,
          ...patch,
          updatedAt: new Date().toISOString(),
        },
      }
    })
  }

  const handleCreateUser = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setLoadingAction(true)
    setError(null)

    try {
      const response = await fetch("/api/users", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(form),
      })
      const payload = (await response.json()) as ApiResponse<User>

      if (!response.ok || !payload.success) {
        throw new Error(payload.message ?? "No se pudo crear el usuario")
      }

      setForm(initialForm)
      await refreshUsers(payload.data?.id)
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Error desconocido")
    } finally {
      setLoadingAction(false)
    }
  }

  const handleDeleteUser = async (userId: string) => {
    const userToDelete = users.find((user) => user.id === userId)
    if (!userToDelete) return

    const confirmed = window.confirm(
      `Eliminar a ${userToDelete.name} del roster?`,
    )
    if (!confirmed) return

    setLoadingAction(true)
    setError(null)

    try {
      const response = await fetch("/api/users", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ id: userId }),
      })
      const payload = (await response.json()) as ApiResponse<User>

      if (!response.ok || !payload.success) {
        throw new Error(payload.message ?? "No se pudo eliminar el usuario")
      }

      await refreshUsers(currentUserId === userId ? null : currentUserId)
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Error desconocido")
    } finally {
      setLoadingAction(false)
    }
  }

  const spin = () => {
    if (eligibleUsers.length === 0 || isSpinning) {
      if (filteredUsers.length > 0 && eligibleUsers.length === 0) {
        setError("Ya salieron todos los usuarios de este filtro. Reinicia la ruleta para volver a empezar.")
      }
      return
    }

    setError(null)
    setIsSpinning(true)
    setCurrentUserId(null)
    clearSpinTimers()

    intervalRef.current = window.setInterval(() => {
      const preview = eligibleUsers[Math.floor(Math.random() * eligibleUsers.length)]
      setSpinningName(preview.name)
    }, spinTickMs)

    timeoutRef.current = window.setTimeout(() => {
      clearSpinTimers()
      const winner = eligibleUsers[Math.floor(Math.random() * eligibleUsers.length)]
      setSpinningName(winner.name)
      setCurrentUserId(winner.id)
      setDrawnUserIds((current) =>
        current.includes(winner.id) ? current : [...current, winner.id],
      )
      setIsSpinning(false)
    }, spinDurationMs)
  }

  const resetRoulette = () => {
    setDrawnUserIds([])
    setCurrentUserId(null)
    setSpinningName("Listo para girar")
    setError(null)
  }

  const buildNotesMarkdown = () => {
    const generatedAt = new Date().toISOString()
    const lines = [
      "# Daily Roulette Notes",
      "",
      `Generated at: ${generatedAt}`,
      `Total users: ${users.length}`,
      `Blocked users: ${blockedUsers.length}`,
      "",
    ]

    if (noteEntries.length === 0) {
      lines.push("No notes or blockages recorded yet.")
      return lines.join("\n")
    }

    for (const { user, status } of noteEntries) {
      lines.push(`## ${user.name}`)
      lines.push(`- Email: ${user.email}`)
      lines.push(`- Team: ${user.team.replaceAll("_", " ")}`)
      lines.push(`- Role: ${user.role.replaceAll("_", " ")}`)
      lines.push(`- Status: ${status?.blocked ? "Blocked" : "Active"}`)
      lines.push(`- Started: ${status?.startedAt ? formatDate(status.startedAt) : "Sin fecha"}`)
      lines.push(`- Updated: ${status?.updatedAt ? formatDate(status.updatedAt) : "Sin fecha"}`)
      lines.push(`- Note: ${status?.note?.trim() ? status.note.trim() : "Sin nota"}`)
      lines.push("")
    }

    return lines.join("\n")
  }

  const exportNotesMarkdown = () => {
    const markdown = buildNotesMarkdown()
    const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" })
    const url = window.URL.createObjectURL(blob)
    const link = document.createElement("a")

    link.href = url
    link.download = `daily-roulette-notes-${new Date().toISOString().slice(0, 10)}.md`
    document.body.appendChild(link)
    link.click()
    link.remove()
    window.URL.revokeObjectURL(url)
  }

  const exportNotesPdf = () => {
    const printWindow = window.open("", "_blank", "noopener,noreferrer,width=1024,height=900")
    if (!printWindow) {
      setError("No se pudo abrir la ventana de impresión")
      return
    }

    const rows = noteEntries
      .map(
        ({ user, status }) => `
          <tr>
            <td>${user.name}</td>
            <td>${user.team.replaceAll("_", " ")}</td>
            <td>${user.role.replaceAll("_", " ")}</td>
            <td>${status?.blocked ? "Blocked" : "Active"}</td>
            <td>${status?.startedAt ? formatDate(status.startedAt) : "Sin fecha"}</td>
            <td>${status?.note?.trim() ? status.note.trim() : "Sin nota"}</td>
          </tr>
        `,
      )
      .join("")

    printWindow.document.write(`
      <!doctype html>
      <html lang="es">
        <head>
          <meta charset="utf-8" />
          <title>Daily Roulette Notes</title>
          <style>
            body { font-family: Arial, Helvetica, sans-serif; padding: 32px; color: #0f172a; }
            h1 { margin: 0 0 8px; font-size: 28px; }
            p { margin: 0 0 12px; color: #475569; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; }
            th, td { border: 1px solid #cbd5e1; padding: 10px; text-align: left; vertical-align: top; font-size: 12px; }
            th { background: #e2e8f0; }
          </style>
        </head>
        <body>
          <h1>Daily Roulette Notes</h1>
          <p>Generated at: ${new Date().toISOString()}</p>
          <p>Total users: ${users.length} | Blocked users: ${blockedUsers.length}</p>
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Team</th>
                <th>Role</th>
                <th>Status</th>
                <th>Started</th>
                <th>Note</th>
              </tr>
            </thead>
            <tbody>
              ${rows || "<tr><td colspan='6'>No notes available</td></tr>"}
            </tbody>
          </table>
          <script>
            window.onload = () => {
              window.focus();
              window.print();
            };
            window.onafterprint = () => window.close();
          </script>
        </body>
      </html>
    `)
    printWindow.document.close()
  }

  const saveNote = () => {
    if (!currentUser) return
    const nextNote = noteRef.current?.value ?? ""
    updateStatus({ note: nextNote })
  }

  const markStarted = () => {
    updateStatus({ startedAt: new Date().toISOString() })
  }

  const markBlocked = () => {
    updateStatus({ blocked: true })
  }

  const clearBlocked = () => {
    updateStatus({ blocked: false })
  }

  const toggleUnavailable = () => {
    if (!currentUser) return

    const currentStatusValue = statusMap[currentUser.id]?.unavailable ?? false
    updateStatus({ unavailable: !currentStatusValue })
    if (!currentStatusValue) {
      setCurrentUserId(null)
    }
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(32,78,224,0.18),_transparent_34%),linear-gradient(180deg,_#09111f_0%,_#0b1220_42%,_#f4f7fb_42%,_#f4f7fb_100%)] text-slate-900">
      <section className="mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
        <div className="overflow-hidden rounded-[2rem] border border-white/10 bg-slate-950/90 p-6 text-white shadow-2xl shadow-slate-950/40 backdrop-blur">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl space-y-4">
              <Badge variant="blue" appearance="filled" className="uppercase tracking-[0.22em]">
                Daily roulette
              </Badge>
              <div className="space-y-3">
                <h1 className="text-4xl font-black tracking-tight sm:text-5xl">
                  Ruleta para dailies, seguimiento de bloqueos y notas de PM
                </h1>
                <p className="max-w-2xl text-base text-slate-300 sm:text-lg">
                  Crea tu roster, filtra por team, gira la ruleta y registra si alguien
                  arrancó, quedó bloqueado o necesita seguimiento.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:flex sm:flex-wrap">
              <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Usuarios</p>
                <p className="mt-1 text-2xl font-semibold">{users.length}</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Disponibles</p>
                <p className="mt-1 text-2xl font-semibold">{eligibleUsers.length}</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Bloqueados</p>
                <p className="mt-1 text-2xl font-semibold">{blockedUsers.length}</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Filtro</p>
                <p className="mt-1 text-2xl font-semibold">
                  {selectedTeam === "ALL" ? "Todos" : selectedTeam}
                </p>
              </div>
            </div>
          </div>
        </div>

        {error ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="space-y-6">
            <section className="rounded-[1.75rem] border border-slate-200 bg-white p-5 shadow-lg shadow-slate-200/60">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h2 className="text-xl font-semibold">Agregar usuario</h2>
                  <p className="text-sm text-slate-500">
                    Crea personas para que entren a la ruleta por team.
                  </p>
                </div>
                <Badge variant="outline" appearance="filled">
                  API /api/users
                </Badge>
              </div>

              <form className="mt-5 grid gap-4 md:grid-cols-2" onSubmit={handleCreateUser}>
                <label className="grid gap-2">
                  <span className="text-sm font-medium text-slate-700">Nombre</span>
                  <input
                    required
                    value={form.name}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, name: event.target.value }))
                    }
                    className="h-11 rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm outline-none transition focus:border-blue-400 focus:bg-white"
                    placeholder="Kevin Hernandez"
                  />
                </label>

                <label className="grid gap-2">
                  <span className="text-sm font-medium text-slate-700">Email</span>
                  <input
                    required
                    type="email"
                    value={form.email}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, email: event.target.value }))
                    }
                    className="h-11 rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm outline-none transition focus:border-blue-400 focus:bg-white"
                    placeholder="kevin@empresa.com"
                  />
                </label>

                <label className="grid gap-2">
                  <span className="text-sm font-medium text-slate-700">Team</span>
                  <select
                    value={form.team}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        team: event.target.value as TeamnName,
                      }))
                    }
                    className="h-11 rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm outline-none transition focus:border-blue-400 focus:bg-white"
                  >
                    {teamOptions.map((team) => (
                      <option key={team} value={team}>
                        {team.replaceAll("_", " ")}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="grid gap-2">
                  <span className="text-sm font-medium text-slate-700">Rol</span>
                  <select
                    value={form.role}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        role: event.target.value as Role,
                      }))
                    }
                    className="h-11 rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm outline-none transition focus:border-blue-400 focus:bg-white"
                  >
                    {roleOptions.map((role) => (
                      <option key={role} value={role}>
                        {role.replaceAll("_", " ")}
                      </option>
                    ))}
                  </select>
                </label>

                <div className="md:col-span-2">
                  <Button
                    type="submit"
                    variant="primary"
                    size="lg"
                    loading={loadingAction}
                    className="w-full justify-center"
                  >
                    Agregar persona al roster
                  </Button>
                </div>
              </form>
            </section>

            <section className="rounded-[1.75rem] border border-slate-200 bg-white p-5 shadow-lg shadow-slate-200/60">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <h2 className="text-xl font-semibold">Roster</h2>
                  <p className="text-sm text-slate-500">
                    Filtra por team y elige a quien debe hablar en la daily.
                  </p>
                </div>

                <label className="grid gap-2 text-sm">
                  <span className="font-medium text-slate-700">Filtro por team</span>
                  <select
                    value={selectedTeam}
                    onChange={(event) => {
                      const nextTeam = event.target.value as TeamnName | "ALL"
                      setSelectedTeam(nextTeam)
                      const nextVisibleUsers =
                        nextTeam === "ALL"
                          ? users
                          : users.filter((user) => user.team === nextTeam)
                      setCurrentUserId((current) =>
                        current && nextVisibleUsers.some((user) => user.id === current)
                          ? current
                          : null,
                      )
                    }}
                    className="h-10 rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm outline-none transition focus:border-blue-400 focus:bg-white"
                  >
                    <option value="ALL">Todos los teams</option>
                    {teamOptions.map((team) => (
                      <option key={team} value={team}>
                        {team.replaceAll("_", " ")}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="mt-5 grid gap-3">
                {loadingUsers ? (
                  <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-6 text-sm text-slate-500">
                    Cargando usuarios...
                  </div>
                ) : filteredUsers.length > 0 ? (
                  filteredUsers.map((user) => {
                    const status = statusMap[user.id]
                    const isSelected = user.id === currentUserId

                    return (
                      <div
                        key={user.id}
                        onClick={() => setCurrentUserId(user.id)}
                        onKeyDown={(event: KeyboardEvent<HTMLDivElement>) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault()
                            setCurrentUserId(user.id)
                          }
                        }}
                        role="button"
                        tabIndex={0}
                        className={`group rounded-2xl border p-4 text-left transition ${
                          isSelected
                            ? "border-blue-400 bg-blue-50 shadow-sm shadow-blue-100"
                            : "border-slate-200 bg-slate-50 hover:border-slate-300 hover:bg-white"
                        }`}
                      >
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <h3 className="font-semibold text-slate-900">{user.name}</h3>
                              {drawnUserIds.includes(user.id) ? (
                                <Badge variant="warning" appearance="dot">
                                  Ya salió
                                </Badge>
                              ) : null}
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation()
                                  setCurrentUserId(user.id)
                                  setStatusMap((current) => {
                                    const previous = current[user.id] ?? {
                                      blocked: false,
                                      unavailable: false,
                                      note: "",
                                      updatedAt: new Date().toISOString(),
                                    }

                                    return {
                                      ...current,
                                      [user.id]: {
                                        ...previous,
                                        unavailable: !previous.unavailable,
                                        updatedAt: new Date().toISOString(),
                                      },
                                    }
                                  })
                                }}
                                className="rounded-full outline-none ring-offset-2 focus-visible:ring-2 focus-visible:ring-blue-500"
                              >
                                {status?.unavailable ? (
                                  <Badge variant="warning" appearance="dot">
                                    No disponible
                                  </Badge>
                                ) : (
                                  <Badge variant="success" appearance="dot">
                                    Disponible
                                  </Badge>
                                )}
                              </button>
                              {status?.blocked ? (
                                <Badge variant="error" appearance="dot">
                                  Bloqueado
                                </Badge>
                              ) : null}
                              {isSelected ? (
                                <Badge variant="blue">En foco</Badge>
                              ) : null}
                            </div>
                            <p className="mt-1 truncate text-sm text-slate-500">{user.email}</p>
                          </div>

                          <div className="flex flex-wrap gap-2">
                            <Badge variant="outline">{user.team.replaceAll("_", " ")}</Badge>
                            <Badge variant="secondary">{user.role.replaceAll("_", " ")}</Badge>
                          </div>
                        </div>

                        <div className="mt-3 flex items-center justify-between gap-3">
                          <p className="text-xs text-slate-500">
                            {status?.note ? status.note : "Sin nota registrada"}
                          </p>

                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={(event) => {
                              event.stopPropagation()
                              void handleDeleteUser(user.id)
                            }}
                          >
                            Eliminar
                          </Button>
                        </div>
                      </div>
                    )
                  })
                ) : (
                  <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-6 text-sm text-slate-500">
                    No hay usuarios para este filtro.
                  </div>
                )}
              </div>
            </section>
          </div>

          <div className="space-y-6">
            <section className="rounded-[1.75rem] border border-slate-200 bg-white p-5 shadow-lg shadow-slate-200/60">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h2 className="text-xl font-semibold">Ruleta</h2>
                  <p className="text-sm text-slate-500">
                    Gira y asigna a la persona que inicia la daily.
                  </p>
                </div>
                <Badge variant={isSpinning ? "warning" : "info"}>
                  {isSpinning ? "Girando" : "Lista"}
                </Badge>
              </div>

              <div className="mt-5 rounded-[1.5rem] border border-slate-200 bg-[linear-gradient(180deg,_#0f172a_0%,_#172554_100%)] p-6 text-white">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm uppercase tracking-[0.25em] text-blue-200">
                    Ruleta
                  </p>
                  <Badge variant={isSpinning ? "warning" : "info"}>
                    {isSpinning ? "Girando" : "En espera"}
                  </Badge>
                </div>

                <div className="mt-4 flex min-h-32 items-center justify-center rounded-[1.25rem] border border-white/10 bg-white/5 px-4 py-8 text-center">
                  <div>
                    <p
                      className={`text-3xl font-black tracking-tight sm:text-4xl ${
                        isSpinning ? "animate-pulse" : ""
                      }`}
                    >
                      {currentUser?.name ?? spinningName}
                    </p>
                    <p className="mt-2 text-sm text-blue-100">
                      {currentUser
                        ? `${currentUser.team.replaceAll("_", " ")} · ${currentUser.role.replaceAll("_", " ")}`
                        : isSpinning
                          ? "Girando la ruleta..."
                          : "Todavia no hay usuario elegido"}
                    </p>
                  </div>
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <Button
                    type="button"
                    variant="primary"
                    size="lg"
                    onClick={spin}
                    disabled={eligibleUsers.length === 0 || isSpinning}
                    className="justify-center"
                  >
                    {isSpinning
                      ? "Girando..."
                      : eligibleUsers.length === 0
                        ? "Sin disponibles"
                        : "Disparar ruleta"}
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    size="lg"
                    onClick={resetRoulette}
                    className="justify-center"
                  >
                    Reiniciar ruleta
                  </Button>
                </div>
              </div>

              <div className="mt-5 grid gap-4">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h3 className="font-semibold text-slate-900">
                        {currentUser ? currentUser.name : "Usuario no elegido"}
                      </h3>
                      <p className="text-sm text-slate-500">
                        {currentUser
                          ? currentUser.email
                          : "La ruleta elegira a alguien o puedes tocar su tarjeta"}
                      </p>
                    </div>

                    {currentStatus?.blocked ? (
                      <Badge variant="error" appearance="dot">
                        Bloqueado
                      </Badge>
                    ) : currentStatus?.unavailable ? (
                      <Badge variant="warning" appearance="dot">
                        No disponible
                      </Badge>
                    ) : currentUser ? (
                      <Badge variant="success" appearance="dot">
                        Activo
                      </Badge>
                    ) : (
                      <Badge variant="outline">Sin persona</Badge>
                    )}
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={markStarted}
                      disabled={!currentUser}
                    >
                      Comenzó
                    </Button>
                    <Button
                      type="button"
                      variant="secondary-destructive"
                      size="sm"
                      onClick={markBlocked}
                      disabled={!currentUser}
                    >
                      Marcar bloqueado
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={toggleUnavailable}
                      disabled={!currentUser}
                    >
                      {currentStatus?.unavailable ? "Marcar disponible" : "Marcar no disponible"}
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={clearBlocked}
                      disabled={!currentUser}
                    >
                      Quitar bloqueo
                    </Button>
                  </div>

                  <div className="mt-4 grid gap-3 text-sm text-slate-600">
                    <div className="flex items-center justify-between gap-4">
                      <span>Inicio</span>
                      <span className="font-medium text-slate-900">
                        {formatDate(currentStatus?.startedAt)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-4">
                      <span>Ultima actualizacion</span>
                      <span className="font-medium text-slate-900">
                        {formatDate(currentStatus?.updatedAt)}
                      </span>
                    </div>
                  </div>
                </div>

                <label className="grid gap-2">
                  <span className="text-sm font-medium text-slate-700">
                    Nota de seguimiento
                  </span>
                  <textarea
                    key={currentUser?.id ?? "no-user"}
                    ref={noteRef}
                    defaultValue={currentStatus?.note ?? ""}
                    rows={6}
                    className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-blue-400 focus:bg-white"
                    placeholder="Escribe bloqueo, dependencias, decisiones o siguiente paso"
                    disabled={!currentUser}
                  />
                </label>

                <Button
                  type="button"
                  variant="primary"
                  size="lg"
                  onClick={saveNote}
                  disabled={!currentUser}
                  className="justify-center"
                >
                  Guardar nota
                </Button>

                <div className="grid gap-3 sm:grid-cols-2">
                  <Button
                    type="button"
                    variant="secondary"
                    size="lg"
                    onClick={exportNotesMarkdown}
                    disabled={noteEntries.length === 0}
                    className="justify-center"
                  >
                    Exportar Markdown
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    size="lg"
                    onClick={exportNotesPdf}
                    disabled={noteEntries.length === 0}
                    className="justify-center"
                  >
                    Exportar PDF
                  </Button>
                </div>
              </div>
            </section>

            <section className="rounded-[1.75rem] border border-slate-200 bg-white p-5 shadow-lg shadow-slate-200/60">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h2 className="text-xl font-semibold">Bloqueos activos</h2>
                  <p className="text-sm text-slate-500">
                    Vista rapida para que como PM puedas dar seguimiento.
                  </p>
                </div>
                <Badge variant="red">{blockedUsers.length}</Badge>
              </div>

              <div className="mt-4 space-y-3">
                {blockedUsers.length > 0 ? (
                  blockedUsers.map((user) => (
                    <div
                      key={user.id}
                      className="rounded-2xl border border-red-100 bg-red-50/70 p-4"
                    >
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <h3 className="font-semibold text-slate-900">{user.name}</h3>
                          <p className="text-sm text-slate-500">{user.email}</p>
                        </div>
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          onClick={() => setCurrentUserId(user.id)}
                        >
                          Revisar
                        </Button>
                      </div>
                      <p className="mt-3 text-sm text-slate-700">
                        {statusMap[user.id]?.note || "Sin nota registrada"}
                      </p>
                    </div>
                  ))
                ) : (
                  <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
                    No hay bloqueos activos.
                  </div>
                )}
              </div>
            </section>
          </div>
        </div>
      </section>
    </main>
  )
}
