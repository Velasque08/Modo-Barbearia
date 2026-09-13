const sb = supabase.createClient(
  window.SUPABASE_URL,
  window.SUPABASE_ANON_KEY
);

let state = {
  shop: null,
  services: [],
  barbers: [],
  selectedService: null,
  selectedBarber: null,
  selectedTime: null
};

const $ = id => document.getElementById(id);

function msg(text, ok = false) {
  const el = $("message");

  if (el) {
    el.textContent = text;
    el.style.color = ok ? "#16834a" : "#b45309";
  }
}

function slugFromUrl() {
  return new URLSearchParams(location.search).get("barbearia") || "principal";
}

function shadeColor(hex, amount) {
  const clean =
    String(hex || "").replace("#", "");

  const full =
    clean.length === 3
      ? clean.split("").map(c => c + c).join("")
      : clean;

  const num = parseInt(full, 16);

  if (isNaN(num)) return hex;

  const clamp = v => Math.max(0, Math.min(255, v));

  const r = clamp((num >> 16) + amount);
  const g = clamp(((num >> 8) & 0xff) + amount);
  const b = clamp((num & 0xff) + amount);

  return (
    "#" +
    (0x1000000 + r * 0x10000 + g * 0x100 + b)
      .toString(16)
      .slice(1)
  );
}

function applyShopTheme(shop) {
  const color = shop?.cor_marca || "#8c1f2b";
  const root = document.documentElement.style;

  root.setProperty("--red", color);
  root.setProperty("--red-deep", shadeColor(color, -22));
  root.setProperty("--red-tint", shadeColor(color, 90));
}

/* =========================================================
   BARBEARIA
========================================================= */

async function loadShop() {
  const connection = $("connectionStatus");

  if (connection) {
    connection.textContent = "Conectando…";
  }

  const slug = slugFromUrl();

  const q = await sb
    .from("barbearias")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();

  if (q.error) {
    console.error("Erro ao carregar barbearia:", q.error);

    if (connection) {
      connection.textContent = "Erro de conexão";
    }

    return;
  }

  state.shop = q.data;

  if (!state.shop) {
    if (connection) {
      connection.textContent = "Barbearia não encontrada";
    }

    console.warn("Nenhuma barbearia encontrada com slug:", slug);
    return;
  }

  applyShopTheme(state.shop);

  if ($("brandTitle")) {
    $("brandTitle").textContent =
      state.shop.nome || "Agendamento";
  }

  if ($("heroTitle")) {
    $("heroTitle").textContent =
      state.shop.titulo || "Seu próximo corte começa aqui.";
  }

  if (connection) {
    connection.textContent = "Agenda online";
  }

  await Promise.all([
    loadServices(),
    loadBarbers()
  ]);

  setMinDate();
}

/* =========================================================
   SERVIÇOS
========================================================= */

async function loadServices() {
  if (!state.shop) return;

  const r = await sb
    .from("servicos")
    .select("*")
    .eq("barbearia_id", state.shop.id)
    .eq("ativo", true)
    .order("nome");

  if (r.error) {
    console.error("Erro ao carregar serviços:", r.error);

    const container = $("services");

    if (container) {
      container.innerHTML =
        "<p>Não foi possível carregar os serviços.</p>";
    }

    return;
  }

  state.services = r.data || [];

  const container = $("services");

  if (!container) return;

  if (!state.services.length) {
    container.innerHTML =
      "<p>Nenhum serviço cadastrado.</p>";
    return;
  }

  container.innerHTML = state.services
    .map(service => {
      const price =
        service.preco !== null &&
        service.preco !== undefined
          ? ` • R$ ${Number(service.preco)
              .toFixed(2)
              .replace(".", ",")}`
          : "";

      return `
        <button
          type="button"
          class="option"
          data-service-id="${escapeAttr(service.id)}"
          onclick="selectService('${escapeAttr(service.id)}', this)"
        >
          <b>${escapeHtml(service.nome)}</b>
          <span>
            ${service.duracao_minutos || 30} min${price}
          </span>
        </button>
      `;
    })
    .join("");
}

function selectService(id, element) {
  state.selectedService = id;
  state.selectedTime = null;

  document
    .querySelectorAll("#services .option")
    .forEach(button => {
      button.classList.remove("selected");
    });

  if (element) {
    element.classList.add("selected");
  }

  loadTimes();
}

/* =========================================================
   BARBEIROS
========================================================= */

async function loadBarbers() {
  if (!state.shop) return;

  const r = await sb
    .from("barbeiros")
    .select("*")
    .eq("barbearia_id", state.shop.id)
    .eq("ativo", true)
    .order("nome");

  if (r.error) {
    console.error("Erro ao carregar barbeiros:", r.error);

    const container = $("barbers");

    if (container) {
      container.innerHTML =
        "<p>Não foi possível carregar os barbeiros.</p>";
    }

    return;
  }

  state.barbers = r.data || [];

  const container = $("barbers");

  if (!container) return;

  if (!state.barbers.length) {
    container.innerHTML =
      "<p>Nenhum barbeiro cadastrado.</p>";
    return;
  }

  container.innerHTML = state.barbers
    .map(barber => {
      return `
        <button
          type="button"
          class="option"
          data-barber-id="${escapeAttr(barber.id)}"
          onclick="selectBarber('${escapeAttr(barber.id)}', this)"
        >
          <b>${escapeHtml(barber.nome)}</b>
        </button>
      `;
    })
    .join("");
}

function selectBarber(id, element) {
  state.selectedBarber = id;
  state.selectedTime = null;

  document
    .querySelectorAll("#barbers .option")
    .forEach(button => {
      button.classList.remove("selected");
    });

  if (element) {
    element.classList.add("selected");
  }

  loadTimes();
}

/* =========================================================
   DATA
========================================================= */

function setMinDate() {
  const dateInput = $("date");

  if (!dateInput) return;

  const d = new Date();

  d.setMinutes(
    d.getMinutes() - d.getTimezoneOffset()
  );

  const today = d.toISOString().slice(0, 10);

  dateInput.min = today;

  if (!dateInput.value) {
    dateInput.value = today;
  }

  loadTimes();
}

const dateInput = $("date");

if (dateInput) {
  dateInput.addEventListener("change", () => {
    state.selectedTime = null;
    loadTimes();
  });
}

/* =========================================================
   HORÁRIOS
========================================================= */

async function loadTimes() {
  const date = $("date")?.value;

  if (!date || !state.shop) {
    return;
  }

  const timesContainer = $("times");

  if (timesContainer) {
    timesContainer.innerHTML =
      "<span>Carregando horários…</span>";
  }

  const start =
    String(
      state.shop.horario_abertura || "08:00"
    ).slice(0, 5);

  const end =
    String(
      state.shop.horario_fechamento || "19:00"
    ).slice(0, 5);

  const blockedQuery = await sb
    .from("bloqueios_agenda")
    .select("*")
    .eq("barbearia_id", state.shop.id)
    .eq("data", date);

  const bookedQuery = await sb
    .from("agendamentos")
    .select("horario, barbeiro_id, status")
    .eq("barbearia_id", state.shop.id)
    .eq("data", date)
    .neq("status", "cancelado");

  if (blockedQuery.error) {
    console.error(
      "Erro ao carregar bloqueios:",
      blockedQuery.error
    );
  }

  if (bookedQuery.error) {
    console.error(
      "Erro ao carregar agendamentos:",
      bookedQuery.error
    );
  }

  const blocks = blockedQuery.data || [];
  const appointments = bookedQuery.data || [];

  const service = state.services.find(
    s => String(s.id) === String(state.selectedService)
  );

  const duration =
    Number(service?.duracao_minutos) || 30;

  const slots = [];

  let current = toMin(start);
  const finish = toMin(end);

  while (current + duration <= finish) {
    const time = fromMin(current);

    const appointmentBusy =
      appointments.some(appointment => {

        const sameBarber =
          !state.selectedBarber ||
          String(appointment.barbeiro_id) ===
            String(state.selectedBarber);

        const sameTime =
          String(appointment.horario)
            .slice(0, 5) === time;

        return sameBarber && sameTime;
      });

    const blockBusy =
      blocks.some(block => {

        const sameBarber =
          !block.barbeiro_id ||
          !state.selectedBarber ||
          String(block.barbeiro_id) ===
            String(state.selectedBarber);

        const blockStart = toMin(block.inicio);
        const blockEnd = toMin(block.fim);

        return (
          sameBarber &&
          blockStart <= current &&
          current < blockEnd
        );
      });

    if (!appointmentBusy && !blockBusy) {
      slots.push(time);
    }

    current += 30;
  }

  if (!timesContainer) return;

  if (!slots.length) {
    timesContainer.innerHTML =
      "<p>Nenhum horário disponível.</p>";
    return;
  }

  timesContainer.innerHTML = slots
    .map(time => {
      return `
        <button
          type="button"
          class="time"
          onclick="selectTime('${time}', this)"
        >
          ${time}
        </button>
      `;
    })
    .join("");
}

function selectTime(time, element) {
  state.selectedTime = time;

  document
    .querySelectorAll(".time")
    .forEach(button => {
      button.classList.remove("selected");
    });

  if (element) {
    element.classList.add("selected");
  }
}

/* =========================================================
   AGENDAMENTO DO CLIENTE
========================================================= */

async function book() {
  const customerName =
    $("customerName")?.value.trim();

  const customerPhone =
    $("customerPhone")?.value.trim();

  const date =
    $("date")?.value;

  if (
    !state.shop ||
    !state.selectedService ||
    !state.selectedBarber ||
    !state.selectedTime ||
    !customerName ||
    !customerPhone ||
    !date
  ) {
    msg(
      "Preencha serviço, barbeiro, horário, data, nome e WhatsApp."
    );

    return;
  }

  const clientPayload = {
    barbearia_id: state.shop.id,
    nome: customerName,
    telefone: customerPhone
  };

  const clientResult = await sb
    .from("clientes")
    .insert(clientPayload)
    .select()
    .single();

  if (clientResult.error) {
    console.error(
      "Erro ao criar cliente:",
      clientResult.error
    );

    msg(
      "Não foi possível concluir o agendamento. Verifique as permissões do Supabase."
    );

    return;
  }

  const payload = {
    barbearia_id: state.shop.id,
    servico_id: state.selectedService,
    barbeiro_id: state.selectedBarber,
    data: date,
    horario: state.selectedTime,
    cliente_id: clientResult.data.id,
    status: "pendente"
  };

  const r = await sb
    .from("agendamentos")
    .insert(payload)
    .select()
    .single();

  if (r.error) {
    console.error(
      "Erro ao criar agendamento:",
      r.error
    );

    if (
      r.error.message &&
      r.error.message.toLowerCase().includes("duplicate")
    ) {
      msg(
        "Esse horário acabou de ser reservado. Escolha outro."
      );
    } else {
      msg(
        "Não foi possível concluir o agendamento. Verifique as permissões do Supabase."
      );
    }

    return;
  }

  msg(
    "Agendamento enviado! A barbearia irá confirmar pelo WhatsApp.",
    true
  );

  state.selectedTime = null;

  loadTimes();
}

/* =========================================================
   ÁREA DA BARBEARIA / LOGIN
========================================================= */

function openAdmin() {
  const screen = $("authScreen");

  if (screen) {
    screen.classList.remove("hidden");
  }
}

function closeAuth() {
  const screen = $("authScreen");

  if (screen) {
    screen.classList.add("hidden");
  }
}

async function loginAdmin() {
  const email =
    $("authEmail")?.value.trim();

  const password =
    $("authPassword")?.value;

  const r = await sb.auth.signInWithPassword({
    email,
    password
  });

  if (r.error) {
    const message = $("authMessage");

    if (message) {
      message.textContent =
        r.error.message;
    }

    return;
  }

  closeAuth();

  await showAdmin();
}

async function signupAdmin() {
  const email =
    $("authEmail")?.value.trim();

  const password =
    $("authPassword")?.value;

  const r = await sb.auth.signUp({
    email,
    password
  });

  const message = $("authMessage");

  if (message) {
    message.textContent = r.error
      ? r.error.message
      : "Conta criada. Confirme o e-mail se o Supabase solicitar.";
  }
}

async function showAdmin() {
  $("bookingView")?.classList.add("hidden");
  $("adminView")?.classList.remove("hidden");

  const userResult =
    await sb.auth.getUser();

  const user = userResult.data.user;

  if ($("adminUser")) {
    $("adminUser").textContent =
      user?.email || "";
  }

  if (user) {
    const ownShop = await sb
      .from("barbearias")
      .select("*")
      .eq("admin_user_id", user.id)
      .maybeSingle();

    if (ownShop.error) {
      console.error(
        "Erro ao identificar a barbearia do admin:",
        ownShop.error
      );
    }

    if (
      ownShop.data &&
      ownShop.data.id !== state.shop?.id
    ) {
      state.shop = ownShop.data;

      applyShopTheme(state.shop);

      if ($("brandTitle")) {
        $("brandTitle").textContent =
          state.shop.nome || "Agendamento";
      }

      if ($("heroTitle")) {
        $("heroTitle").textContent =
          state.shop.titulo ||
          "Seu próximo corte começa aqui.";
      }

      await Promise.all([
        loadServices(),
        loadBarbers()
      ]);
    }
  }

  await loadAdmin();
}

function showBooking() {
  $("adminView")?.classList.add("hidden");
  $("bookingView")?.classList.remove("hidden");
}

async function logoutAdmin() {
  await sb.auth.signOut();

  showBooking();
}

/* =========================================================
   ADMINISTRAÇÃO
========================================================= */

async function loadAdmin() {
  if (!state.shop) return;

  if ($("shopName")) {
    $("shopName").value =
      state.shop.nome || "";
  }

  if ($("shopSlug")) {
    $("shopSlug").value =
      state.shop.slug || "";
  }

  if ($("shopPhone")) {
    $("shopPhone").value =
      state.shop.whatsapp || "";
  }

  if ($("shopColor")) {
    $("shopColor").value =
      state.shop.cor_marca || "#8c1f2b";
  }

  if ($("openTime")) {
    $("openTime").value =
      String(
        state.shop.horario_abertura || "08:00"
      ).slice(0, 5);
  }

  if ($("closeTime")) {
    $("closeTime").value =
      String(
        state.shop.horario_fechamento || "19:00"
      ).slice(0, 5);
  }

  renderAdminLists();

  await renderAppointments();

  await renderBlocks();
}

function renderAdminLists() {
  const serviceAdmin =
    $("serviceAdmin");

  if (serviceAdmin) {
    serviceAdmin.innerHTML =
      state.services
        .map(service => {
          return `
            <label>
              ${escapeHtml(service.nome)}

              <input
                type="text"
                value="${escapeAttr(
                  service.preco ?? ""
                )}"
                onchange="updateService('${escapeAttr(
                  service.id
                )}', this.value)"
              >
              <button
                type="button"
                class="ghost"
                onclick="removeService('${escapeAttr(
                  service.id
                )}')"
              >Remover</button>
            </label>
          `;
        })
        .join("");
  }

  const barberAdmin =
    $("barberAdmin");

  if (barberAdmin) {
    barberAdmin.innerHTML =
      state.barbers
        .map(barber => {
          return `
            <label>
              ${escapeHtml(barber.nome)}
              <button
                type="button"
                class="ghost"
                onclick="removeBarber('${escapeAttr(
                  barber.id
                )}')"
              >Remover</button>
            </label>
          `;
        })
        .join("");
  }

  const agendaBarber =
    $("agendaBarber");

  if (agendaBarber) {
    agendaBarber.innerHTML =
      '<option value="">Todos</option>' +
      state.barbers
        .map(barber => {
          return `
            <option value="${escapeAttr(barber.id)}">
              ${escapeHtml(barber.nome)}
            </option>
          `;
        })
        .join("");
  }

  const blockBarber =
    $("blockBarber");

  if (blockBarber) {
    blockBarber.innerHTML =
      '<option value="">Todos</option>' +
      state.barbers
        .map(barber => {
          return `
            <option value="${escapeAttr(barber.id)}">
              ${escapeHtml(barber.nome)}
            </option>
          `;
        })
        .join("");
  }
}

/* =========================================================
   CONFIGURAÇÕES
========================================================= */

async function saveSettings() {
  if (!state.shop) return;

  const data = {
    nome: $("shopName")?.value || "",
    whatsapp: $("shopPhone")?.value || "",
    cor_marca: $("shopColor")?.value || "#8c1f2b",
    horario_abertura:
      $("openTime")?.value || "08:00",
    horario_fechamento:
      $("closeTime")?.value || "19:00"
  };

  const r = await sb
    .from("barbearias")
    .update(data)
    .eq("id", state.shop.id)
    .select()
    .single();

  if (r.error) {
    alert(r.error.message);
    return;
  }

  alert("Configurações salvas.");

  state.shop = r.data;

  applyShopTheme(state.shop);

  if ($("brandTitle")) {
    $("brandTitle").textContent =
      state.shop.nome || "Agendamento";
  }
}

/* =========================================================
   SERVIÇOS ADMIN
========================================================= */

async function addService() {
  const nome =
    prompt("Nome do serviço");

  if (!nome) return;

  const r = await sb
    .from("servicos")
    .insert({
      barbearia_id: state.shop.id,
      nome: nome.trim(),
      duracao_minutos: 30,
      preco: 0,
      ativo: true
    });

  if (r.error) {
    alert(
      "Erro ao adicionar serviço: " +
      r.error.message
    );

    return;
  }

  await loadServices();

  renderAdminLists();
}

async function removeService(id) {
  const ok = confirm(
    "Remover este serviço? Ele deixa de aparecer para os clientes, mas o histórico de agendamentos já feitos é mantido."
  );

  if (!ok) return;

  const r = await sb
    .from("servicos")
    .update({ ativo: false })
    .eq("id", id);

  if (r.error) {
    alert(
      "Erro ao remover serviço: " +
      r.error.message
    );

    return;
  }

  await loadServices();

  renderAdminLists();
}

async function updateService(id, preco) {
  const value =
    Number(
      String(preco)
        .replace(/[^\d,.-]/g, "")
        .replace(",", ".")
    ) || 0;

  const r = await sb
    .from("servicos")
    .update({
      preco: value
    })
    .eq("id", id);

  if (r.error) {
    console.error(
      "Erro ao atualizar serviço:",
      r.error
    );
  }
}

/* =========================================================
   BARBEIROS ADMIN
========================================================= */

async function addBarber() {
  const nome =
    prompt("Nome do barbeiro");

  if (!nome) return;

  const r = await sb
    .from("barbeiros")
    .insert({
      barbearia_id: state.shop.id,
      nome: nome.trim(),
      ativo: true
    });

  if (r.error) {
    alert(
      "Erro ao adicionar barbeiro: " +
      r.error.message
    );

    return;
  }

  await loadBarbers();

  renderAdminLists();
}

async function removeBarber(id) {
  const ok = confirm(
    "Remover este barbeiro? Ele deixa de aparecer para os clientes, mas o histórico de agendamentos já feitos é mantido."
  );

  if (!ok) return;

  const r = await sb
    .from("barbeiros")
    .update({ ativo: false })
    .eq("id", id);

  if (r.error) {
    alert(
      "Erro ao remover barbeiro: " +
      r.error.message
    );

    return;
  }

  await loadBarbers();

  renderAdminLists();
}

/* =========================================================
   AGENDA ADMIN
========================================================= */

async function renderAppointments() {
  if (!state.shop) return;

  const date =
    $("agendaDate")?.value ||
    $("date")?.value;

  if (!date) return;

  const barber =
    $("agendaBarber")?.value || "";

  let query = sb
    .from("agendamentos")
    .select("*, clientes(nome, telefone), servicos(nome)")
    .eq("barbearia_id", state.shop.id)
    .eq("data", date)
    .order("horario");

  if (barber) {
    query = query.eq(
      "barbeiro_id",
      barber
    );
  }

  const r = await query;

  if (r.error) {
    console.error(
      "Erro ao carregar agenda:",
      r.error
    );

    return;
  }

  const rows = r.data || [];

  const container =
    $("appointments");

  if (!container) return;

  if (!rows.length) {
    container.innerHTML =
      "<p>Nenhum agendamento.</p>";

    return;
  }

  container.innerHTML =
    rows
      .map(appointment => {
        return `
          <div class="appointment">

            <div>
              <b>
                ${escapeHtml(
                  String(
                    appointment.horario
                  ).slice(0, 5)
                )}
                —
                ${escapeHtml(
                  appointment.clientes?.nome || ""
                )}
              </b>

              <div>
                ${escapeHtml(
                  appointment.clientes?.telefone || ""
                )}
                •
                ${escapeHtml(
                  appointment.status ||
                  "pendente"
                )}
              </div>
            </div>

            <div>

              ${
                appointment.status !== "confirmado"
                  ? `
                    <button
                      type="button"
                      class="secondary"
                      onclick="setStatus('${escapeAttr(
                        appointment.id
                      )}', 'confirmado')"
                    >
                      Confirmar
                    </button>
                  `
                  : ""
              }

              ${
                appointment.status !== "cancelado"
                  ? `
                    <button
                      type="button"
                      class="ghost"
                      onclick="setStatus('${escapeAttr(
                        appointment.id
                      )}', 'cancelado')"
                    >
                      Cancelar
                    </button>
                  `
                  : ""
              }

              ${
                buildWhatsappLink(appointment)
                  ? `
                    <a
                      class="ghost"
                      href="${escapeAttr(
                        buildWhatsappLink(appointment)
                      )}"
                      target="_blank"
                      rel="noopener"
                    >
                      Enviar WhatsApp
                    </a>
                  `
                  : ""
              }

            </div>

          </div>
        `;
      })
      .join("");
}

function buildWhatsappLink(appointment) {
  const rawPhone = String(
    appointment.clientes?.telefone || ""
  ).replace(/\D/g, "");

  if (!rawPhone) return "";

  const phone =
    rawPhone.length <= 11
      ? "55" + rawPhone
      : rawPhone;

  const shopName =
    state.shop?.nome || "a barbearia";

  const serviceName =
    appointment.servicos?.nome || "seu horário";

  const time = String(
    appointment.horario
  ).slice(0, 5);

  const dateParts = String(
    appointment.data
  ).split("-");

  const dateBr =
    dateParts.length === 3
      ? `${dateParts[2]}/${dateParts[1]}/${dateParts[0]}`
      : appointment.data;

  const statusText =
    appointment.status === "cancelado"
      ? `Infelizmente seu agendamento de ${serviceName} em ${dateBr} às ${time} foi cancelado.`
      : `Seu agendamento de ${serviceName} em ${dateBr} às ${time} foi confirmado!`;

  const message =
    `Olá! ${statusText} - ${shopName}`;

  return (
    "https://wa.me/" +
    phone +
    "?text=" +
    encodeURIComponent(message)
  );
}

async function setStatus(id, status) {
  const r = await sb
    .from("agendamentos")
    .update({
      status
    })
    .eq("id", id);

  if (r.error) {
    alert(
      "Erro ao atualizar agendamento: " +
      r.error.message
    );

    return;
  }

  await renderAppointments();
  await loadTimes();
}

/* =========================================================
   BLOQUEIOS
========================================================= */

async function blockSlot() {
  const date =
    $("blockDate")?.value;

  if (!date) {
    alert("Escolha uma data.");
    return;
  }

  const inicio =
    $("blockStart")?.value;

  const fim =
    $("blockEnd")?.value;

  if (!inicio || !fim) {
    alert(
      "Informe o horário inicial e final."
    );

    return;
  }

  const barber =
    $("blockBarber")?.value || null;

  const r = await sb
    .from("bloqueios_agenda")
    .insert({
      barbearia_id: state.shop.id,
      data: date,
      inicio,
      fim,
      barbeiro_id: barber
    });

  if (r.error) {
    alert(
      "Erro ao bloquear horário: " +
      r.error.message
    );

    return;
  }

  await renderBlocks();

  await loadTimes();
}

async function renderBlocks() {
  if (!state.shop) return;

  const r = await sb
    .from("bloqueios_agenda")
    .select("*")
    .eq("barbearia_id", state.shop.id)
    .order("data", {
      ascending: false
    });

  if (r.error) {
    console.error(
      "Erro ao carregar bloqueios:",
      r.error
    );

    return;
  }

  const container =
    $("blocks");

  if (!container) return;

  const rows = r.data || [];

  if (!rows.length) {
    container.innerHTML =
      "<p>Nenhum bloqueio.</p>";

    return;
  }

  container.innerHTML =
    rows
      .map(block => {
        return `
          <div class="block">

            <span>
              ${escapeHtml(block.data)}
              ${escapeHtml(
                String(block.inicio).slice(0, 5)
              )}
              –
              ${escapeHtml(
                String(block.fim).slice(0, 5)
              )}
            </span>

            <button
              type="button"
              class="ghost"
              onclick="deleteBlock('${escapeAttr(
                block.id
              )}')"
            >
              Excluir
            </button>

          </div>
        `;
      })
      .join("");
}

async function deleteBlock(id) {
  const r = await sb
    .from("bloqueios_agenda")
    .delete()
    .eq("id", id);

  if (r.error) {
    alert(
      "Erro ao excluir bloqueio: " +
      r.error.message
    );

    return;
  }

  await renderBlocks();

  await loadTimes();
}

/* =========================================================
   LINK PÚBLICO
========================================================= */

function copyPublicLink() {
  if (!state.shop) return;

  const link =
    location.origin +
    location.pathname +
    "?barbearia=" +
    encodeURIComponent(
      state.shop.slug
    );

  if (
    navigator.clipboard &&
    navigator.clipboard.writeText
  ) {
    navigator.clipboard
      .writeText(link)
      .then(() => {
        alert(
          "Link da barbearia copiado."
        );
      })
      .catch(() => {
        prompt(
          "Copie o link abaixo:",
          link
        );
      });
  } else {
    prompt(
      "Copie o link abaixo:",
      link
    );
  }
}

/* =========================================================
   UTILITÁRIOS
========================================================= */

function toMin(value) {
  const parts =
    String(value)
      .slice(0, 5)
      .split(":")
      .map(Number);

  return (
    (parts[0] || 0) * 60 +
    (parts[1] || 0)
  );
}

function fromMin(minutes) {
  return (
    String(
      Math.floor(minutes / 60)
    ).padStart(2, "0") +
    ":" +
    String(
      minutes % 60
    ).padStart(2, "0")
  );
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(
      /[&<>"']/g,
      character => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;"
      }[character])
    );
}

function escapeAttr(value) {
  return escapeHtml(value);
}

/* =========================================================
   INICIALIZAÇÃO
========================================================= */

async function initializeApp() {
  try {
    await loadShop();
  } catch (error) {
    console.error(
      "Erro inesperado ao iniciar sistema:",
      error
    );

    const connection =
      $("connectionStatus");

    if (connection) {
      connection.textContent =
        "Erro de conexão";
    }
  }
}

initializeApp();

/* =========================================================
   AUTENTICAÇÃO SUPABASE
========================================================= */

sb.auth.onAuthStateChange(
  (_event, session) => {

    const logoutButton =
      $("logoutBtn");

    if (logoutButton) {
      if (session) {
        logoutButton.classList.remove(
          "hidden"
        );
      } else {
        logoutButton.classList.add(
          "hidden"
        );
      }
    }
  }
);