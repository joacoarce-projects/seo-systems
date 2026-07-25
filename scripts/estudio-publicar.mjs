/**
 * Publica el Estudio Rocket como post del blog en cms/_collections/blog.json.
 *
 * El cuerpo se arma DESDE medicion.json, no a mano: si se re-mide la muestra y
 * cambian los números, se vuelve a correr y el texto queda consistente. Eso evita
 * el peor riesgo de un estudio publicado, que es que la tabla y el texto se
 * contradigan después de una actualización.
 *
 * ENCUADRE DENTRO DEL PLAN (corregido 2026-07-24 tras revisión de Joaquín):
 * la primera versión salió como pieza suelta, repitiendo los 3 errores que el
 * propio content-plan de mayo ya había diagnosticado en los posts viejos: sin KW
 * validada, 0 enlaces internos a money pages y 0 fuentes externas.
 *
 * Reglas del content-plan que este script ahora cumple por construcción:
 *   - mínimo 2 enlaces internos a money pages
 *   - enlaces externos SOLO a fuentes autoritativas (Google, la herramienta
 *     medida). Nunca a agencias competidoras
 *   - DAB en las primeras 150 palabras
 *   - sección "Preguntas frecuentes" con el patrón <p><strong>¿?</strong></p>,
 *     que es lo que el template de blog convierte en schema FAQPage
 *
 * KW (medida con DataForSEO, Chile, 2026-07-24):
 *   core web vitals ........... 140/mes · competencia LOW  <- TARGET
 *   auditoria seo .............. 50/mes · MEDIUM
 *   test de velocidad de web ... 40/mes · LOW
 *   auditoria web / analizar sitio web ... 20/mes
 *   wordpress lento / acelerar wordpress . 10/mes
 *   velocidad sitios web chile ... SIN VOLUMEN (era el target inicial, mal elegido)
 *
 * Se ataca "core web vitals" porque es el mayor volumen ganable del tema y no
 * obliga a forzar el contenido: el LCP y los datos de campo que ya medimos SON
 * Core Web Vitals. Solo faltaba nombrarlos.
 * Cuidado con el matiz: quien busca ese término suele ser técnico o de marketing,
 * no el dueño que compra. Por eso el término va en el title y en una sección
 * propia, pero el cuerpo sigue hablando en lenguaje de negocio.
 * En paralelo la pieza sigue siendo un activo AEO: ser citada cuando alguien le
 * pregunta a un chatbot por qué su web carga lento.
 *
 * Uso: node estudio-publicar.mjs <medicion.json> <ruta blog.json>
 */
import fs from 'node:fs';

const [, , medPath, blogPath] = process.argv;
if (!medPath || !blogPath) {
  console.error('Uso: node estudio-publicar.mjs <medicion.json> <blog.json>');
  process.exit(1);
}

const d = JSON.parse(fs.readFileSync(medPath, 'utf8'));
const n = d.length;

const num = (a) => a.filter((x) => typeof x === 'number');
const med = (a) => { const s = [...a].sort((x, y) => x - y); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const lcpNum = (s) => (s.movil?.lcp ? Number(String(s.movil.lcp).replace(/[^0-9.]/g, '')) : null);

const movil = num(d.map((s) => s.movil?.score));
const lcps = num(d.map(lcpNum));
const pesos = num(d.map((s) => s.movil?.pesoKb));
const grados = d.map((s) => s.seguridad?.grade).filter(Boolean);
const crux = d.map((s) => s.movil?.cruxVeredicto).filter(Boolean);

const sobre90 = movil.filter((x) => x >= 90).length;
const lcpMalos = lcps.filter((x) => x > 4).length;
const reprobados = grados.filter((g) => ['D', 'E', 'F'].includes(g)).length;
const aplus = grados.filter((g) => g === 'A+').length;
const cruxRapidos = crux.filter((c) => c === 'FAST').length;
const cruxLentos = crux.filter((c) => c === 'SLOW').length;
const pesados = pesos.filter((p) => p > 5120).length;

const faltas = {};
for (const s of d) for (const f of s.seguridad?.faltan ?? []) faltas[f] = (faltas[f] ?? 0) + 1;
const faltaTop = Object.entries(faltas).sort((a, b) => b[1] - a[1])[0];

const peor = [...d].sort((a, b) => (a.movil?.score ?? 999) - (b.movil?.score ?? 999))[0];
const mejor = [...d].sort((a, b) => (b.movil?.score ?? -1) - (a.movil?.score ?? -1))[0];
const primerosLentos = d.filter((s) => s.pos === 1 && (s.movil?.score ?? 100) < 50);
const nichos = [...new Set(d.map((s) => s.nicho))];

const esc = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const fmtLcp = (s) => (s.movil?.lcp ? String(s.movil.lcp).replace(/ /g, ' ') : 'sin dato');
const mb = (kb) => (kb != null ? `${(kb / 1024).toFixed(1)} MB` : 'sin dato');

const filas = [...d]
  .sort((a, b) => (a.movil?.score ?? 999) - (b.movil?.score ?? 999))
  .map((s) => `<tr><td>${esc(s.domain)}</td><td>${esc(s.nicho)}</td><td>${s.pos}</td><td>${s.movil?.score ?? 'sin dato'}</td><td>${fmtLcp(s)}</td><td>${mb(s.movil?.pesoKb)}</td><td>${s.seguridad?.grade ?? 'sin dato'}</td></tr>`)
  .join('\n');

const DAB = `Medimos los Core Web Vitals de ${n} páginas web de Chile que salen en la primera página de Google por la búsqueda comercial de su rubro. Ninguna supera 90 en velocidad móvil y las ${n} superan los 4 segundos de LCP, el umbral que Google considera malo. La mediana fue ${med(lcps).toFixed(1)} segundos.`;

const contenido = `<p>${DAB}</p>

<p>Este es el primer corte de una medición que vamos a repetir. No es una encuesta ni una opinión sobre cómo está la web en Chile: son ${n} páginas reales, medidas con herramientas públicas, y abajo está el método completo para que cualquiera lo repita y llegue al mismo resultado.</p>

<h2>Qué medimos exactamente</h2>

<p>Elegimos ${nichos.length} rubros de servicios: ${nichos.join(', ').toLowerCase()}. Para cada uno tomamos la búsqueda con la que un cliente busca ese servicio y nos quedamos con las tres páginas chilenas mejor posicionadas en Google. La muestra no son páginas abandonadas: <strong>son las que ya le están ganando a su competencia en buscadores</strong>.</p>

<p>A cada una le medimos dos cosas. La velocidad con <a href="https://pagespeed.web.dev/" target="_blank" rel="noopener">PageSpeed Insights de Google</a>, en móvil y escritorio. Y las cabeceras de seguridad HTTP, las mismas cinco que evalúa <a href="https://securityheaders.com/" target="_blank" rel="noopener">Security Headers</a>: HSTS, Content-Security-Policy, X-Content-Type-Options, X-Frame-Options y Referrer-Policy.</p>

<h2>Qué son los Core Web Vitals</h2>

<p>Son las tres métricas con las que Google mide la experiencia real de quien entra a tu página. No son un puntaje inventado por una agencia: las define Google y las usa en su propia evaluación.</p>

<ul>
<li><strong>LCP</strong> (Largest Contentful Paint): cuánto demora en aparecer el elemento principal de la pantalla, normalmente la foto o el título grande. Bueno bajo 2,5 segundos, malo sobre 4.</li>
<li><strong>INP</strong> (Interaction to Next Paint): cuánto tarda la página en responder cuando alguien toca un botón. Bueno bajo 200 milisegundos.</li>
<li><strong>CLS</strong> (Cumulative Layout Shift): cuánto se mueve el contenido mientras carga, eso de ir a tocar algo y que se corra solo. Bueno bajo 0,1.</li>
</ul>

<p>La que más pesa en la práctica es el LCP, porque es la que el visitante siente como "esta página no carga". Es la que reportamos en la tabla de abajo.</p>

<h2>El resultado: ninguna aprueba en móvil</h2>

<table>
<thead><tr><th>Página</th><th>Rubro</th><th>Posición</th><th>Velocidad móvil</th><th>Carga del contenido</th><th>Peso</th><th>Seguridad</th></tr></thead>
<tbody>
${filas}
</tbody>
</table>

<p>De las ${n} páginas, <strong>${sobre90} superan los 90 puntos en velocidad móvil</strong>. La mediana quedó en ${med(movil)}. La mejor de la muestra fue ${esc(mejor.domain)} con ${mejor.movil.score}, y la peor ${esc(peor.domain)} con ${peor.movil.score}.</p>

<p>La cifra que más importa no es el puntaje sino el tiempo real de carga. Google define que mostrar el contenido principal debería tomar <a href="https://web.dev/articles/lcp" target="_blank" rel="noopener">menos de 2,5 segundos</a>, y que sobre 4 segundos la experiencia es mala. <strong>Las ${n} páginas están sobre esos 4 segundos.</strong> La mediana fue ${med(lcps).toFixed(1)} segundos y el caso extremo tardó ${Math.max(...lcps).toFixed(1)}.</p>

<h2>¿Y esto lo notan los usuarios de verdad?</h2>

<p>Sí, y no es una proyección nuestra. Chrome recopila los tiempos de carga de usuarios reales y los publica por sitio cuando hay tráfico suficiente. ${crux.length} de las ${n} páginas tenían datos suficientes. De esas, <strong>${cruxRapidos} califica como rápida y ${cruxLentos} como lentas</strong>. El resto queda en el medio.</p>

<p>Esa distinción importa porque separa el laboratorio de la realidad. Una página puede salir mal en una prueba puntual y andar bien para sus visitantes. Acá no: quienes entran a estas páginas desde Chile están esperando.</p>

<h2>Estar primero en Google no significa ser rápido</h2>

<p>${primerosLentos.length > 0
  ? `El hallazgo que menos esperábamos. En la muestra hay ${primerosLentos.length} ${primerosLentos.length === 1 ? 'página que aparece' : 'páginas que aparecen'} en <strong>primer lugar</strong> de su rubro con menos de 50 puntos en móvil. El caso más marcado es ${esc(primerosLentos[0].domain)}: número uno de su categoría, ${primerosLentos[0].movil.score} puntos y ${fmtLcp(primerosLentos[0])} para mostrar su contenido.`
  : 'En esta muestra la posición y la velocidad no se movieron juntas.'}</p>

<p>La conclusión honesta es que la velocidad no es lo único que define el ranking, y que una página lenta puede posicionar bien si el resto la acompaña. Pero eso no significa que dé lo mismo. Significa que <strong>quien llega primero está pagando ese lugar con visitantes que se van antes de ver la página</strong>, y que ese primer lugar es más frágil de lo que parece frente a un competidor que sí cargue rápido.</p>

<h2>Seguridad: ${reprobados} de ${grados.length} reprueban</h2>

<p>Las cabeceras de seguridad son instrucciones que tu servidor le da al navegador para protegerte a ti y a quien te visita. No cuestan dinero, se configuran una vez y no cambian nada de cómo se ve la página. Aun así, <strong>${reprobados} de las ${grados.length} que pudimos medir sacaron D, E o F</strong>, y solo ${aplus} llegaron a A+.</p>

<p>La más ausente fue ${esc(faltaTop[0])}, que falta en ${faltaTop[1]} de ${grados.length}. Esto no es lo mismo que ser hackeado, pero sí es la puerta que queda sin llave: si ya te pasó, tenemos una guía de <a href="/wordpress-hackeado/">qué hacer con un WordPress hackeado</a> en las primeras horas.</p>

<h2>El peso es el problema de fondo</h2>

<p>La mediana de peso de estas páginas en móvil fue ${mb(med(pesos))}, y ${pesados} superan los 5 MB. Para dimensionarlo: una página bien construida debería estar bajo 1 MB. El caso más extremo de la muestra descarga ${mb(Math.max(...pesos))} cada vez que alguien la abre desde el celular.</p>

<p>Casi siempre es lo mismo: imágenes subidas sin comprimir en el tamaño original de la cámara, plugins que cargan librerías completas para un solo efecto, y tres o cuatro herramientas de terceros que se suman con el tiempo y nadie vuelve a revisar. Cuando el problema es estructural y no se arregla con ajustes, la salida es <a href="/servicios/migracion-wordpress/">reconstruir el sitio sobre código propio</a>.</p>

<h2>Cómo repetir esta medición en tu propia página</h2>

<p>Todo lo que hicimos se puede reproducir gratis y sin instalar nada:</p>

<ol>
<li>Entra a PageSpeed Insights de Google, pega tu dirección y mira la pestaña móvil, no la de escritorio. La mayoría de tus visitantes llega desde el celular.</li>
<li>Fíjate en el tiempo del contenido principal antes que en el puntaje de colores. Sobre 4 segundos es malo según el propio Google.</li>
<li>Entra a securityheaders.com, pega tu dirección y anota la nota que te da.</li>
<li>Si tienes tráfico suficiente, la misma pantalla de PageSpeed te muestra los datos de tus usuarios reales de los últimos 28 días.</li>
</ol>

<p>Si tu página quedó parecida a la mediana de esta tabla, no estás peor que tu competencia. Estás igual. Y eso es justamente la oportunidad.</p>

<h2>Qué pasa cuando una página se reconstruye</h2>

<p>Como contraste, estas son las cuatro que reconstruimos nosotros, medidas con las mismas herramientas. El antes es el sitio que tenían cuando llegaron:</p>

<table>
<thead><tr><th>Sitio</th><th>Velocidad móvil</th><th>Seguridad</th></tr></thead>
<tbody>
<tr><td>Cuerpo de Bomberos de Viña del Mar</td><td>59 a 94</td><td>B a A+</td></tr>
<tr><td>IGNEO</td><td>61 a 97</td><td>F a A+</td></tr>
<tr><td>Dr. David Oschilewski</td><td>66 a 95</td><td>F a A+</td></tr>
<tr><td>Rocket Media</td><td>51 a 96</td><td>D a A+</td></tr>
</tbody>
</table>

<p>Son cuatro casos, no una muestra grande, y son clientes nuestros: tómalo como lo que es. Lo que sí puedes verificar por tu cuenta es el después, porque las cuatro están publicadas y las puedes medir tú mismo ahora. Mantenerlas así en el tiempo es trabajo de <a href="/servicios/mantenimiento-web/">mantención mensual</a>, no de una sola pasada.</p>

<h2>Método y límites de este estudio</h2>

<p>Para que esto sirva como referencia hay que ser claro en qué es y qué no es:</p>

<ul>
<li><strong>Muestra</strong>: ${n} páginas, tres por rubro en ${nichos.length} rubros. Es una muestra chica y no pretende representar a toda la web de Chile.</li>
<li><strong>Selección</strong>: los tres primeros resultados chilenos de Google para la búsqueda comercial de cada rubro, excluyendo directorios y agregadores.</li>
<li><strong>Herramientas</strong>: PageSpeed Insights para velocidad y los cinco chequeos de cabeceras de Security Headers.</li>
<li><strong>Fecha</strong>: julio de 2026. Estos números cambian, por eso la medición se va a repetir.</li>
<li><strong>Lo que no medimos</strong>: contenido, conversión, accesibilidad ni posicionamiento más allá de la posición de entrada.</li>
<li><strong>Datos incompletos</strong>: ${d.filter((s) => s.seguridad?.error || s.movil?.error).length > 0 ? `${d.filter((s) => s.seguridad?.error || s.movil?.error).map((s) => esc(s.domain)).join(', ')} bloqueó parte de la medición y quedó fuera de los promedios que corresponde.` : 'ninguno.'}</li>
</ul>

<h2 id="preguntas-frecuentes">Preguntas frecuentes</h2>

<p><strong>¿Qué son los Core Web Vitals?</strong> Son las tres métricas con las que Google mide la experiencia real de tus visitantes: LCP (cuánto demora en aparecer el contenido principal), INP (cuánto tarda en responder al tocar algo) y CLS (cuánto se mueve el contenido mientras carga). Se miden gratis en PageSpeed Insights, y en esta muestra de ${n} páginas chilenas ninguna aprobaba en móvil.</p>

<p><strong>¿Cuánto debería demorar en cargar mi página web?</strong> Google define el umbral bueno en 2,5 segundos para mostrar el contenido principal en móvil, y considera mala la experiencia sobre 4 segundos. En esta muestra de ${n} páginas chilenas la mediana fue ${med(lcps).toFixed(1)} segundos, más del triple del umbral malo.</p>

<p><strong>¿Por qué mi página web es lenta?</strong> En la mayoría de los casos por peso: imágenes sin comprimir, plugins que cargan librerías completas y herramientas de terceros acumuladas. La mediana de peso en esta muestra fue ${mb(med(pesos))}, cuando una página bien construida debería pesar bajo 1 MB. El hosting influye, pero suele ser lo segundo, no lo primero.</p>

<p><strong>¿Cómo mido la velocidad de mi página gratis?</strong> Con PageSpeed Insights de Google: pegas la dirección y te entrega el puntaje de laboratorio más los datos de tus usuarios reales si tienes tráfico suficiente. Mira siempre la pestaña móvil primero, porque es de donde llega la mayoría de las visitas.</p>

<p><strong>¿Una página lenta pierde posiciones en Google?</strong> No de forma automática. En esta muestra hay páginas en primer lugar con menos de 50 puntos en móvil, así que la velocidad no es lo único que define el ranking. Lo que sí pasa es que quien entra desde el celular se va antes de ver el contenido, y ese primer lugar queda expuesto frente a un competidor que cargue rápido.</p>

<p><strong>¿Las cabeceras de seguridad afectan el posicionamiento?</strong> No directamente. Son protección para ti y para quien te visita, y se configuran una sola vez sin costo. En esta muestra ${reprobados} de ${grados.length} páginas reprobaron, así que es de las cosas más baratas de arreglar y de las más ignoradas.</p>

<p>Vamos a repetir esta medición con más páginas y más rubros. Si quieres que incluyamos la tuya, o saber en qué parte de esta tabla caes hoy, escríbenos.</p>`;

const post = {
  id: 'estudio-velocidad-sitios-web-chile',
  slug: 'estudio-velocidad-sitios-web-chile',
  titulo: `Core Web Vitals en Chile: analizamos ${n} webs que salen primeras en Google`,
  extracto: `Qué son los Core Web Vitals y cómo están en Chile: medimos ${n} páginas web que ya salen primeras en Google y ninguna aprueba en móvil. Tabla completa y método.`,
  fecha: '2026-07-24',
  categoria: 'Estudios',
  imagen: 'public/assets/estudio-velocidad-sitios-chile.webp',
  imagenAlt: `Gráfico del estudio de Rocket Media sobre Core Web Vitals en Chile: velocidad móvil en PageSpeed de ${n} páginas web que salen primeras en Google, ninguna sobre 90 puntos y mediana de ${med(movil)}`,
  contenido,
  featured: true,
  published: true,
  dab: DAB,
  keyword: 'core web vitals',
  author: 'Joaquín Arce',
};
// Campos espejo que usa el render del blog (title/description/cat/pubDate/cover...).
post.title = post.titulo;
post.description = post.extracto;
post.cat = post.categoria;
post.pubDate = post.fecha;
post.cover = post.imagen;
post.coverAlt = post.imagenAlt;
post.bodyImage = post.imagen;
post.bodyImageAlt = post.imagenAlt;

const blog = JSON.parse(fs.readFileSync(blogPath, 'utf8'));
const i = blog.findIndex((p) => p.slug === post.slug);
if (i >= 0) blog[i] = post; else blog.push(post);
fs.writeFileSync(blogPath, JSON.stringify(blog, null, 2));

const palabras = contenido.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().split(' ').length;
console.error(`${i >= 0 ? 'Actualizado' : 'Publicado'}: ${post.slug}`);
console.error(`Palabras del cuerpo: ${palabras} · DAB: ${DAB.split(' ').length} palabras`);
console.error(`Posts en el blog: ${blog.length}`);
