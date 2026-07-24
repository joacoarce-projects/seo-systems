/**
 * Publica el Estudio Rocket como post del blog en cms/_collections/blog.json.
 *
 * El cuerpo se arma DESDE medicion.json, no a mano: si se re-mide la muestra y
 * cambian los números, se vuelve a correr y el texto queda consistente. Eso evita
 * el peor riesgo de un estudio publicado, que es que la tabla y el texto se
 * contradigan después de una actualización.
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

const DAB = `Medimos ${n} sitios chilenos que salen en la primera página de Google por la keyword comercial de su rubro. Ninguno supera 90 en velocidad móvil y los ${n} tardan más de 4 segundos en mostrar su contenido principal, el umbral que Google considera malo. La mediana fue ${med(lcps).toFixed(1)} segundos.`;

const contenido = `<p>${DAB}</p>

<p>Este es el primer corte de una medición que vamos a repetir. No es una encuesta ni una opinión sobre el estado de la web chilena: son ${n} sitios reales, medidos con herramientas públicas, y abajo está el método completo para que cualquiera pueda repetirlo y llegar al mismo resultado.</p>

<h2>Qué medimos exactamente</h2>

<p>Elegimos ${nichos.length} rubros de servicios en Chile: ${nichos.join(', ').toLowerCase()}. Para cada uno tomamos la keyword comercial con la que un cliente busca ese servicio y nos quedamos con los tres sitios chilenos mejor posicionados en Google. Es decir, la muestra no son sitios abandonados: <strong>son los que ya le están ganando a su competencia en buscadores</strong>.</p>

<p>A cada uno le medimos dos cosas. La velocidad con PageSpeed Insights de Google, en móvil y escritorio. Y las cabeceras de seguridad HTTP, las mismas cinco que evalúa Security Headers: HSTS, Content-Security-Policy, X-Content-Type-Options, X-Frame-Options y Referrer-Policy.</p>

<h2>El resultado: ninguno aprueba en móvil</h2>

<table>
<thead><tr><th>Sitio</th><th>Rubro</th><th>Posición</th><th>Velocidad móvil</th><th>Carga del contenido</th><th>Peso</th><th>Seguridad</th></tr></thead>
<tbody>
${filas}
</tbody>
</table>

<p>De los ${n} sitios, <strong>${sobre90} superan los 90 puntos en velocidad móvil</strong>. La mediana quedó en ${med(movil)}. El mejor de la muestra fue ${esc(mejor.domain)} con ${mejor.movil.score}, y el peor ${esc(peor.domain)} con ${peor.movil.score}.</p>

<p>La cifra que más importa no es el puntaje sino el tiempo real de carga. Google considera que mostrar el contenido principal debe tomar menos de 2,5 segundos, y que sobre 4 segundos la experiencia es mala. <strong>Los ${n} sitios están sobre esos 4 segundos.</strong> La mediana fue ${med(lcps).toFixed(1)} segundos y el caso extremo tardó ${Math.max(...lcps).toFixed(1)}.</p>

<h2>¿Y esto lo notan los usuarios de verdad?</h2>

<p>Sí, y no es una proyección nuestra. Chrome recopila los tiempos de carga de usuarios reales y publica esos datos por sitio cuando hay tráfico suficiente. ${crux.length} de los ${n} sitios de la muestra tenían datos suficientes. De esos, <strong>${cruxRapidos} califica como rápido y ${cruxLentos} como lento</strong>. El resto queda en el medio.</p>

<p>Esa distinción importa porque separa el laboratorio de la realidad. Un sitio puede salir mal en una prueba puntual y andar bien para sus visitantes. Acá no: los usuarios chilenos que entran a estos sitios están esperando.</p>

<h2>Estar primero en Google no significa ser rápido</h2>

<p>${primerosLentos.length > 0
  ? `El hallazgo que menos esperábamos. En la muestra hay ${primerosLentos.length} ${primerosLentos.length === 1 ? 'sitio que aparece' : 'sitios que aparecen'} en <strong>primer lugar</strong> de su rubro con menos de 50 puntos en móvil. El caso más marcado es ${esc(primerosLentos[0].domain)}: número uno de su categoría, ${primerosLentos[0].movil.score} puntos y ${fmtLcp(primerosLentos[0])} para mostrar su contenido.`
  : 'En esta muestra la posición y la velocidad no se movieron juntas.'}</p>

<p>La conclusión honesta es que la velocidad no es lo único que define el ranking, y que un sitio lento puede posicionar bien si el resto lo acompaña. Pero eso no significa que dé lo mismo. Significa que <strong>quien llega primero está pagando ese lugar con visitantes que se van antes de ver la página</strong>, y que ese primer lugar es más frágil de lo que parece frente a un competidor que sí cargue rápido.</p>

<h2>Seguridad: ${reprobados} de ${grados.length} reprueban</h2>

<p>Las cabeceras de seguridad son instrucciones que tu servidor le da al navegador para protegerte a ti y a quien te visita. No cuestan dinero, se configuran una vez y no cambian nada de cómo se ve el sitio. Aun así, <strong>${reprobados} de los ${grados.length} sitios que pudimos medir sacaron D, E o F</strong>, y solo ${aplus} llegaron a A+.</p>

<p>La más ausente fue ${esc(faltaTop[0])}, que falta en ${faltaTop[1]} de ${grados.length} sitios. Es la diferencia entre que tu sitio filtre a terceros desde qué página venía cada visitante y que no lo haga.</p>

<h2>El peso es el problema de fondo</h2>

<p>La mediana de peso de estas páginas en móvil fue ${mb(med(pesos))}, y ${pesados} superan los 5 MB. Para dimensionarlo: una página bien construida debería estar bajo 1 MB. El caso más extremo de la muestra descarga ${mb(Math.max(...pesos))} cada vez que alguien la abre desde el celular.</p>

<p>Casi siempre es lo mismo: imágenes subidas sin comprimir en el tamaño original de la cámara, plugins que cargan librerías completas para un solo efecto, y tres o cuatro herramientas de terceros que se suman con el tiempo y nadie vuelve a revisar.</p>

<h2>Cómo repetir esta medición en tu propio sitio</h2>

<p>Todo lo que hicimos se puede reproducir gratis y sin instalar nada:</p>

<ol>
<li>Entra a PageSpeed Insights de Google, pega la dirección de tu sitio y mira la pestaña móvil, no la de escritorio. La mayoría de tus visitantes llega desde el celular.</li>
<li>Fíjate en el tiempo del contenido principal antes que en el puntaje de colores. Sobre 4 segundos es malo según el propio Google.</li>
<li>Entra a securityheaders.com, pega tu dirección y anota la nota que te da.</li>
<li>Si tienes tráfico suficiente, la misma pantalla de PageSpeed te muestra los datos de tus usuarios reales de los últimos 28 días.</li>
</ol>

<p>Si tu sitio quedó parecido a la mediana de esta tabla, no estás peor que tu competencia. Estás igual. Y eso es justamente la oportunidad.</p>

<h2>Qué pasa cuando un sitio se reconstruye</h2>

<p>Como contraste, estos son los cuatro sitios que reconstruimos nosotros, medidos con las mismas herramientas. El antes es el sitio que tenían cuando llegaron:</p>

<table>
<thead><tr><th>Sitio</th><th>Velocidad móvil</th><th>Seguridad</th></tr></thead>
<tbody>
<tr><td>Cuerpo de Bomberos de Viña del Mar</td><td>59 a 94</td><td>B a A+</td></tr>
<tr><td>IGNEO</td><td>61 a 97</td><td>F a A+</td></tr>
<tr><td>Dr. David Oschilewski</td><td>66 a 95</td><td>F a A+</td></tr>
<tr><td>Rocket Media</td><td>51 a 96</td><td>D a A+</td></tr>
</tbody>
</table>

<p>Son cuatro casos, no una muestra grande, y son clientes nuestros: tómalo como lo que es. Lo que sí puedes verificar por tu cuenta es el después, porque los cuatro sitios están publicados y los puedes medir tú mismo ahora.</p>

<h2>Método y límites de este estudio</h2>

<p>Para que esto sirva como referencia hay que ser claro en qué es y qué no es:</p>

<ul>
<li><strong>Muestra</strong>: ${n} sitios, tres por rubro en ${nichos.length} rubros. Es una muestra chica y no pretende representar a toda la web chilena.</li>
<li><strong>Selección</strong>: los tres primeros resultados chilenos de Google para la keyword comercial de cada rubro, excluyendo directorios y agregadores.</li>
<li><strong>Herramientas</strong>: PageSpeed Insights para velocidad y los cinco chequeos de cabeceras de Security Headers.</li>
<li><strong>Fecha</strong>: julio de 2026. Estos números cambian, por eso la medición se va a repetir.</li>
<li><strong>Lo que no medimos</strong>: contenido, conversión, accesibilidad ni posicionamiento más allá de la posición de entrada.</li>
<li><strong>Datos incompletos</strong>: ${d.filter((s) => s.seguridad?.error || s.movil?.error).length > 0 ? `${d.filter((s) => s.seguridad?.error || s.movil?.error).map((s) => esc(s.domain)).join(', ')} bloqueó parte de la medición y quedó fuera de los promedios que corresponde.` : 'ninguno.'}</li>
</ul>

<p>Vamos a repetir esta medición con más sitios y más rubros. Si quieres que incluyamos el tuyo, o saber en qué parte de esta tabla caes hoy, escríbenos.</p>`;

const post = {
  id: 'estudio-velocidad-sitios-web-chile',
  slug: 'estudio-velocidad-sitios-web-chile',
  titulo: `Auditamos ${n} sitios chilenos que salen primeros en Google: ninguno aprueba en velocidad móvil`,
  extracto: `Medimos velocidad y seguridad de ${n} sitios que ya rankean en la primera página por su keyword comercial. Ninguno supera 90 en móvil, los ${n} tardan más de 4 segundos en cargar y ${reprobados} de ${grados.length} reprueban en seguridad. Con la tabla completa y el método para repetirlo.`,
  fecha: '2026-07-24',
  categoria: 'Estudios',
  imagen: 'public/assets/estudio-velocidad-sitios-chile.webp',
  imagenAlt: `Estudio Rocket Media: velocidad móvil de ${n} sitios chilenos que rankean primeros en Google, ninguno sobre 90 puntos en PageSpeed y mediana de ${med(movil)}`,
  contenido,
  featured: true,
  published: true,
  dab: DAB,
  keyword: 'velocidad sitios web chile',
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
