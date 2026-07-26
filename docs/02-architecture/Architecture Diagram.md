<style>
*{box-sizing:border-box}
.root{font-family:var(--font-sans);padding:1rem 0}
.section-label{font-size:11px;font-weight:500;letter-spacing:.06em;text-transform:uppercase;color:var(--text-muted);margin:0 0 10px}
.zone{border:0.5px dashed var(--border-strong);border-radius:12px;padding:14px 16px;margin-bottom:14px}
.zone-title{font-size:11px;font-weight:500;color:var(--text-muted);margin:0 0 10px}
.cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:10px}
.card{background:var(--surface-2);border:0.5px solid var(--border);border-radius:var(--radius);padding:12px 14px}
.card-port{font-family:var(--font-mono);font-size:11px;font-weight:500;border-radius:4px;padding:2px 7px;display:inline-block;margin-bottom:8px}
.card-name{font-size:14px;font-weight:500;color:var(--text-primary);margin-bottom:3px}
.card-desc{font-size:12px;color:var(--text-muted);line-height:1.5}
.port-purple{background:#EEEDFE;color:#3C3489}
.port-teal{background:#E1F5EE;color:#085041}
.port-gray{background:#F1EFE8;color:#444441}
.port-amber{background:#FAEEDA;color:#633806}
@media(prefers-color-scheme:dark){
  .port-purple{background:#3C3489;color:#CECBF6}
  .port-teal{background:#085041;color:#9FE1CB}
  .port-gray{background:#444441;color:#D3D1C7}
  .port-amber{background:#633806;color:#FAC775}
}
.divider{border:none;border-top:0.5px solid var(--border);margin:18px 0}
.conn-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.conn-item{display:flex;align-items:flex-start;gap:10px;background:var(--surface-1);border:0.5px solid var(--border);border-radius:var(--radius);padding:10px 12px}
.conn-arrow{font-size:13px;color:var(--text-muted);flex-shrink:0;margin-top:1px}
.conn-text{font-size:13px;color:var(--text-secondary);line-height:1.5}
.conn-text strong{color:var(--text-primary);font-weight:500}
.boot-list{display:flex;flex-direction:column;gap:6px;margin-top:10px}
.boot-row{display:flex;align-items:center;gap:10px;font-size:13px;color:var(--text-secondary)}
.boot-step{width:22px;height:22px;border-radius:50%;border:0.5px solid var(--border-strong);display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:500;color:var(--text-muted);flex-shrink:0}
.boot-services{display:flex;gap:6px;flex-wrap:wrap}
.boot-tag{font-size:11px;background:var(--surface-0);border:0.5px solid var(--border);border-radius:4px;padding:2px 7px;color:var(--text-secondary);font-family:var(--font-mono)}
.note{font-size:12px;color:var(--text-muted);margin-top:4px;line-height:1.5}
</style>

# Architecture Diagram

<div class="root">

  <div class="zone">
    <div class="zone-title">Data plane — tráfico de clientes</div>
    <div class="cards">
      <div class="card">
        <span class="card-port port-purple">:3000</span>
        <div class="card-name">gateway-core</div>
        <div class="card-desc">Recibe requests de clientes y los enruta al backend correcto aplicando políticas</div>
      </div>
    </div>
  </div>

  <div class="zone">
    <div class="zone-title">Control plane — configuración y administración</div>
    <div class="cards">
      <div class="card">
        <span class="card-port port-teal">:3001</span>
        <div class="card-name">management-api</div>
        <div class="card-desc">API REST para crear y editar proxies, products y developer apps</div>
      </div>
      <div class="card">
        <span class="card-port port-teal">:3002</span>
        <div class="card-name">admin-panel</div>
        <div class="card-desc">Panel web Next.js. Solo lo usa el administrador desde el navegador</div>
      </div>
    </div>
  </div>

  <div class="zone">
    <div class="zone-title">Infraestructura compartida</div>
    <div class="cards">
      <div class="card">
        <span class="card-port port-gray">:5432</span>
        <div class="card-name">postgres</div>
        <div class="card-desc">Base de datos principal. Guarda toda la configuración de forma permanente</div>
      </div>
      <div class="card">
        <span class="card-port port-gray">:6379</span>
        <div class="card-name">redis</div>
        <div class="card-desc">Caché de configuración y contadores de rate limiting. En memoria</div>
      </div>
    </div>
  </div>

  <div class="zone">
    <div class="zone-title">Observabilidad</div>
    <div class="cards">
      <div class="card">
        <span class="card-port port-amber">:9090</span>
        <div class="card-name">prometheus</div>
        <div class="card-desc">Rasca <code style="font-size:11px;background:var(--surface-0);padding:1px 4px;border-radius:3px">/metrics</code> del gateway cada 15s y guarda series temporales</div>
      </div>
      <div class="card">
        <span class="card-port port-amber">:3004</span>
        <div class="card-name">grafana</div>
        <div class="card-desc">Dashboards de tráfico, latencia y errores. Consulta a Prometheus</div>
      </div>
    </div>
  </div>

  <hr class="divider">

  <div class="section-label">Quién habla con quién</div>
  <div class="conn-grid">
    <div class="conn-item">
      <span class="conn-arrow">→</span>
      <div class="conn-text"><strong>Clientes</strong> → gateway-core:3000<br>Partners y apps internas del banco</div>
    </div>
    <div class="conn-item">
      <span class="conn-arrow">→</span>
      <div class="conn-text"><strong>Navegador admin</strong> → admin-panel:3002<br>El administrador gestiona proxies y apps</div>
    </div>
    <div class="conn-item">
      <span class="conn-arrow">→</span>
      <div class="conn-text"><strong>admin-panel</strong> → management-api:3001<br>Llamadas REST para leer y modificar config</div>
    </div>
    <div class="conn-item">
      <span class="conn-arrow">→</span>
      <div class="conn-text"><strong>management-api</strong> → postgres:5432<br>CRUD de organizations, proxies, products, apps</div>
    </div>
    <div class="conn-item">
      <span class="conn-arrow">→</span>
      <div class="conn-text"><strong>management-api</strong> → redis:6379<br>Invalida la caché cuando se edita un proxy</div>
    </div>
    <div class="conn-item">
      <span class="conn-arrow">→</span>
      <div class="conn-text"><strong>gateway-core</strong> → redis:6379<br>Rate limiting atómico + caché de config de proxies</div>
    </div>
    <div class="conn-item">
      <span class="conn-arrow">→</span>
      <div class="conn-text"><strong>gateway-core</strong> → postgres:5432<br>Solo al arrancar (carga config inicial en memoria)</div>
    </div>
    <div class="conn-item">
      <span class="conn-arrow">→</span>
      <div class="conn-text"><strong>prometheus</strong> → gateway-core:3000/metrics<br>Scrape automático cada 15 segundos</div>
    </div>
    <div class="conn-item">
      <span class="conn-arrow">→</span>
      <div class="conn-text"><strong>Navegador admin</strong> → grafana:3004<br>Ver dashboards de latencia y tráfico</div>
    </div>
    <div class="conn-item">
      <span class="conn-arrow">→</span>
      <div class="conn-text"><strong>grafana</strong> → prometheus:9090<br>Queries PromQL para dibujar las gráficas</div>
    </div>
  </div>

  <hr class="divider">

  <div class="section-label">Orden de arranque con docker-compose up</div>
  <div class="boot-list">
    <div class="boot-row">
      <div class="boot-step">1</div>
      <div class="boot-services">
        <span class="boot-tag">postgres</span>
        <span class="boot-tag">redis</span>
      </div>
      <span class="note">Sin dependencias. Arrancan primero.</span>
    </div>
    <div class="boot-row">
      <div class="boot-step">2</div>
      <div class="boot-services">
        <span class="boot-tag">gateway-core</span>
        <span class="boot-tag">management-api</span>
      </div>
      <span class="note">depends_on: postgres, redis</span>
    </div>
    <div class="boot-row">
      <div class="boot-step">3</div>
      <div class="boot-services">
        <span class="boot-tag">admin-panel</span>
        <span class="boot-tag">prometheus</span>
      </div>
      <span class="note">depends_on: management-api / gateway-core</span>
    </div>
    <div class="boot-row">
      <div class="boot-step">4</div>
      <div class="boot-services">
        <span class="boot-tag">grafana</span>
      </div>
      <span class="note">depends_on: prometheus</span>
    </div>
  </div>

</div>
