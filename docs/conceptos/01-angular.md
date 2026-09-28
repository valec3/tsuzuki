# 🅰️ Guía Técnica y Arquitectónica — Angular 21 (Moderno)

Esta guía documenta cada directiva, función, patrón y concepto de Angular que usamos en **Tsuzuki**, explicando el **QUÉ**, el **POR QUÉ** y el **CÓMO** a nivel técnico con ejemplos completos del sistema.

---

## Índice de Contenidos
1. [Arquitectura de Componentes Standalone](#1-arquitectura-de-componentes-standalone)
2. [Detección de Cambios: ChangeDetectionStrategy.OnPush](#2-detección-de-cambios-changedetectionstrategyonpush)
3. [Reactividad con Signals (El nuevo estándar)](#3-reactividad-con-signals-el-nuevo-estándar)
4. [Inyección de Dependencias: inject()](#4-inyección-de-dependencias-inject)
5. [Comunicación entre Componentes: input() y output()](#5-comunicación-entre-componentes-input-y-output)
6. [Nuevo Control Flow Nativo (@if, @for con track)](#6-nuevo-control-flow-nativo-en-templates-if-for-switch)
7. [Cliente HTTP: provideHttpClient(withFetch())](#7-cliente-http-providehttpclientwithfetch)
8. [Manejo Asíncrono y Debounce con RxJS (Comparativa React vs Angular)](#8-manejo-asíncrono-y-debounce-con-rxjs-comparativa-react-vs-angular)

---

## 1. Arquitectura de Componentes Standalone

### 1.1 ¿Qué es un Componente Standalone?
En versiones anteriores (Angular 2 a 16), todo componente requería registrarse dentro de un `@NgModule` (un contenedor de configuración pesado). Desde Angular 17+, y consolidado en **Angular 20/21**, los componentes son **Standalone por defecto**: son unidades autónomas que declaran explícitamente sus propias dependencias.

```typescript
@Component({
  selector: 'app-item-card',
  templateUrl: './item-card.component.html',
  styleUrl: './item-card.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ItemCardComponent { ... }
```

> **Regla técnica (`AGENTS.md`)**: En Angular v20+ **NO se escribe `standalone: true`** dentro del decorador `@Component`, porque ya es el valor predeterminado del compilador.

---

## 2. Detección de Cambios: `ChangeDetectionStrategy.OnPush`

### 2.1 El problema de la detección por defecto (Default)
En modo `Default`, cada vez que ocurre cualquier evento asíncrono en el navegador (un click, un `setTimeout`, una respuesta HTTP), Angular recorre **todo el árbol de componentes de arriba a abajo** preguntando: *«¿Cambió algo acá? ¿Y acá?»*. En teléfonos móviles esto drena batería y causa micro-congelamientos.

### 2.2 La solución: `OnPush`
`OnPush` le ordena a Angular:
> *"No vuelvas a renderizar este componente a menos que cambie una de sus señales (`signals`) o una de sus entradas (`inputs`). Si nada de eso cambió, saltate este componente por completo."*

```typescript
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush, // Eficiencia quirúrgica
})
```

---

## 3. Reactividad con Signals (El nuevo estándar)

Una **Signal** es un envoltorio reactivo alrededor de un valor que notifica automáticamente a los consumidores interesados cuando ese valor cambia. Es como una celda de Excel.

### 3.1 `signal<T>(valorInicial)` — Señal Escribible (WritableSignal)
Se usa para el estado local que puede ser modificado.

```typescript
// Creación
const currentChapter = signal(12);

// Lectura (se invoca como función)
console.log(currentChapter()); // 12

// Mutación 1: Asignación directa (.set)
currentChapter.set(13);

// Mutación 2: Actualización basada en el valor anterior (.update)
currentChapter.update(prev => prev + 1); // 14
```

> **Regla técnica (`AGENTS.md`)**: **NUNCA usar `.mutate()`**, ya que fue deprecado y eliminado en Angular moderno. Usar siempre `.set()` o `.update()`.

### 3.2 `.asReadonly()` — Encapsulamiento del Estado
Para evitar que componentes externos modifiquen el estado interno de un servicio sin pasar por sus métodos:

```typescript
// En ItemService:
private readonly _items = signal<MediaItem[]>([]);

// Los componentes solo pueden leer, no hacer .set() desde afuera
readonly items = this._items.asReadonly();
```

- **Por qué `readonly` no alcanza**: `readonly items = signal(...)` solo impide reasignar la variable con `=`, pero aún permite llamar a `.set()` o `.update()`.
- **Por qué `.asReadonly()` blinda el tipo**: Transforma el tipo a `Signal<T>`, eliminando de raíz los métodos `.set()` y `.update()`.

### 3.3 `computed(() => ...)` — Señal Derivada
Calcula un valor reactivo a partir de otras señales. Es **memoizada**: solo se recalcula si alguna de las señales de las que depende cambia de valor.

```typescript
// En ItemCardComponent:
protected readonly progressPercentage = computed(() => {
  const current = this.item().current_chapter;
  const total = this.item().total_chapters;
  if (!total || total <= 0) return 0;
  return Math.min(100, Math.round((current / total) * 100));
});
```

---

## 4. Inyección de Dependencias: `inject()`

### 4.1 De constructores a `inject()`
Antes, para inyectar un servicio se requería un constructor verboso:

```typescript
// ❌ Estilo viejo (Constructor Injection)
constructor(private http: HttpClient, private itemService: ItemService) {}

// ✅ Estilo moderno (Function Injection - inject())
private readonly http = inject(HttpClient);
private readonly itemService = inject(ItemService);
```

### 4.2 Ventajas técnicas de `inject()`
1. **Inferencia estricta de tipos**: TypeScript deduce el tipo sin redundancias.
2. **Uso fuera de constructores**: Se puede usar para inicializar propiedades directamente en la declaración.
3. **Composición limpia**: Facilita crear funciones de ayuda desacopladas de las clases.

---

## 5. Comunicación entre Componentes: `input()` y `output()`

En Angular moderno, los decoradores `@Input()` y `@Output()` fueron sustituidos por **funciones reactivas integradas con Signals**.

### 5.1 `input()` e `input.required()`
Declara una entrada reactiva para el componente:

```typescript
// En ItemCardComponent:
export class ItemCardComponent {
  // Entrada obligatoria: genera una Signal de solo lectura
  readonly item = input.required<MediaItem>();
}
```

En el HTML del padre (`home.component.html`):
```html
<app-item-card [item]="manga" />
```

### 5.2 `output()`
Declara un emisor de eventos tipado:

```typescript
// En ItemCardComponent:
export class ItemCardComponent {
  readonly increment = output<string>(); // Emite el ID del manga

  protected onIncrementClick(event: MouseEvent): void {
    event.stopPropagation();
    this.increment.emit(this.item().id);
  }
}
```

En el HTML del padre (`home.component.html`):
```html
<app-item-card [item]="manga" (increment)="onIncrement($event)" />
```

---

## 6. Nuevo Control Flow Nativo en Templates (`@if`, `@for`, `@switch`)

Reemplazó a las directivas estructurales `*ngIf`, `*ngFor` y `*ngSwitch`.

### 6.1 `@if` / `@else`
```html
@if (loading()) {
  <div class="spinner"></div>
} @else if (error()) {
  <p>{{ error() }}</p>
} @else if (items().length > 0) {
  <section class="grid">...</section>
} @else {
  <p>Tu biblioteca está vacía.</p>
}
```

### 6.2 `@for` y la obligación de `track`
```html
@for (manga of items(); track manga.id) {
  <app-item-card [item]="manga" (increment)="onIncrement($event)" />
}
```

> **Por qué `track` es obligatorio**:
> `track manga.id` le enseña a Angular qué propiedad identifica unívocamente a cada fila del DOM. Cuando un elemento cambia de orden o se agrega uno nuevo, Angular **reutiliza los nodos del DOM existentes y no destruye toda la lista**.

---

## 7. Cliente HTTP: `provideHttpClient(withFetch())`

En [`src/app/app.config.ts`](file:///c:/Users/User/Development/Self/tsuzuki/src/app/app.config.ts):

```typescript
provideHttpClient(withFetch())
```

- **`withFetch()`**: Fuerza a Angular a utilizar la API estándar `fetch()` en lugar del arcaico `XMLHttpRequest`.
- **Integración con Service Worker**: El Service Worker de nuestra PWA (`@angular/service-worker`) puede interceptar y cachear estas peticiones `fetch` de manera nativa para habilitar navegación offline.

---

## 8. Manejo Asíncrono y Debounce con RxJS (Comparativa React vs Angular)

### 8.1 ¿Qué es Debounce y qué problema resuelve?
El **Debounce** es una técnica que retrasa la ejecución de una función hasta que haya pasado una cantidad determinada de tiempo sin que se vuelva a disparar el evento.

- **El caso de Tsuzuki (Spam Clicking en `+1 Capítulo`)**:
  Si el usuario leyó 5 capítulos y toca rápidamente el botón 5 veces seguidas:
  - **Sin Debounce**: La app dispara 5 peticiones HTTP simultáneas en paralelo. Como viajan por internet sin orden garantizado, la petición 2 puede llegar antes que la 1, causando una condición de carrera (*Race Condition*) en la base de datos D1 y sobrescrituras erróneas en pantalla.
  - **Con Debounce y Acumulación**: La UI suma inmediatamente `+1`, `+2`, `+3`, `+4`, `+5` en 0 milisegundos gracias a las Signals. Al detectar 400ms de calma (el usuario paró de tocar), se envía **un único request HTTP consolidado con `delta: 5`**.

---

### 8.2 ¿Cómo se hace en React vs cómo se hace en Angular?

Entender la diferencia entre ambos te da un panorama arquitectónico completo:

#### En React:
En React no existe un sistema de streams reactivos nativo. Normalmente se usa un hook personalizado con `setTimeout` y `useEffect`:

```tsx
// En React:
function useDebounce(value, delay) {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    // Limpieza manual al desmontar o cambiar el valor:
    return () => clearTimeout(handler);
  }, [value, delay]);

  return debouncedValue;
}
```

*Desventajas en React*: Si querés acumular deltas (sumar `1 + 1 + 1 = 3`), el `useEffect` se vuelve propenso a estados desincronizados por el ciclo de renderizado del componente.

---

#### En Angular (Con RxJS nativo):
Angular incluye de fábrica **RxJS**, la librería estándar de programación reactiva basada en Observables y Streams de eventos. En vez de timers manuales con `clearTimeout`, se modela como una tubería declarativa (`pipe`):

```
Evento Click ───> [Subject] ───> [pipe(debounceTime(400))] ───> [HTTP Request Único]
```

---

### 8.3 Ejemplo Completo Real en Tsuzuki ([`src/app/services/item.service.ts`](file:///c:/Users/User/Development/Self/tsuzuki/src/app/services/item.service.ts))

Este es el código exacto que tenemos funcionando en nuestra aplicación, analizado línea por línea:

```typescript
import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Subject } from 'rxjs';
import { debounceTime } from 'rxjs/operators';
import { MediaItem } from '../models/item.model';

@Injectable({
  providedIn: 'root',
})
export class ItemService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = '/api/items';

  // 1. Estado reactivo interno
  private readonly _items = signal<MediaItem[]>([]);
  readonly items = this._items.asReadonly();

  // 2. Stream de eventos de progreso (Subject emite valores a través del tiempo)
  private readonly progressTrigger$ = new Subject<{ id: string; delta: number }>();

  // 3. Diccionario en memoria para acumular deltas por ítem (ej: { 'item-1': 3 })
  private readonly pendingDeltas = new Map<string, number>();

  constructor() {
    // Inicializamos la escucha del debounce al nacer el servicio
    this.setupDebouncedProgress();
  }

  /**
   * Método invocado por el botón de la tarjeta:
   */
  incrementProgress(id: string, delta = 1): void {
    const targetItem = this._items().find((item) => item.id === id);
    if (!targetItem) return;

    // A) FEEDBACK INSTANTÁNEO EN PANTALLA (0 ms):
    // La Signal se actualiza en el momento exacto del click. La UI no espera a la red.
    this._items.update((items) =>
      items.map((item) =>
        item.id === id ? { ...item, current_chapter: item.current_chapter + delta } : item
      )
    );

    // B) ACUMULACIÓN: Sumamos el delta pendiente en el Map
    const currentAccumulated = this.pendingDeltas.get(id) ?? 0;
    this.pendingDeltas.set(id, currentAccumulated + delta);

    // C) EMISIÓN: Le avisamos al Subject que hubo actividad
    this.progressTrigger$.next({ id, delta });
  }

  /**
   * Tubería de Debounce con RxJS:
   */
  private setupDebouncedProgress(): void {
    this.progressTrigger$
      .pipe(
        // debounceTime: silencia el stream y solo deja pasar la señal
        // cuando hayan transcurrido 400ms sin nuevos clicks.
        debounceTime(400)
      )
      .subscribe(() => {
        // Al cumplirse los 400ms de calma, procesamos cada ítem acumulado:
        for (const [id, totalDelta] of this.pendingDeltas.entries()) {
          if (totalDelta <= 0) continue;

          // Vaciamos el acumulador para no reenviar si entra otro click después
          this.pendingDeltas.delete(id);

          // Disparamos UNA SOLA llamada HTTP a Cloudflare con el total acumulado
          this.http
            .post<MediaItem>(`${this.apiUrl}/${id}/progress`, {
              mode: 'delta',
              delta: totalDelta, // Por ejemplo: delta = 5
            })
            .subscribe({
              next: (updatedItem) => {
                // Confirmamos el valor final persistido en la DB D1
                this._items.update((items) =>
                  items.map((item) => (item.id === id ? updatedItem : item))
                );
              },
              error: (err) => {
                console.error('Error al sincronizar progreso:', err);
                // Si la red falló, revertimos o recargamos para mantener consistencia
                this.loadItems();
              },
            });
        }
      });
  }
}
```

### 8.4 Glosario de Términos RxJS usados en el ejemplo:
- **`Subject`**: Es a la vez un emisor (*Observable*) y un receptor (*Observer*). Actúa como un megáfono al que le podés mandar datos con `.next()` y escuchar con `.subscribe()`.
- **`pipe(...)`**: Método que permite encadenar operadores de transformación antes de que los datos lleguen al suscriptor.
- **`debounceTime(ms)`**: Operador de RxJS que descarta emisiones que ocurran en intervalos menores al tiempo especificado en milisegundos, dejando pasar únicamente la última.
- **`subscribe(...)`**: Punto final donde se ejecuta el efecto secundario (en este caso, la llamada HTTP `post`).
