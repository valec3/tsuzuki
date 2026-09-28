import { Injectable, inject, signal } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Subject, of } from 'rxjs';
import { debounceTime, distinctUntilChanged, switchMap, catchError } from 'rxjs/operators';
import { MediaItem, ItemFilters, ItemStatus, ItemStats } from '../models/item.model';

@Injectable({
  providedIn: 'root',
})
export class ItemService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = '/api/items';

  // --- Estado reactivo privado ---
  private readonly _items = signal<MediaItem[]>([]);
  private readonly _loading = signal<boolean>(false);
  private readonly _error = signal<string | null>(null);
  private readonly _activeStatus = signal<ItemStatus | 'todos'>('todos');
  private readonly _searchQuery = signal<string>('');
  private readonly _viewMode = signal<'grid' | 'list'>('grid');
  private readonly _sort = signal<string>('updated_at');
  private readonly _stats = signal<ItemStats>({
    total: 0,
    by_status: {},
    total_chapters: 0,
  });

  // --- Estado público de solo lectura para los componentes ---
  readonly items = this._items.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly error = this._error.asReadonly();
  readonly activeStatus = this._activeStatus.asReadonly();
  readonly searchQuery = this._searchQuery.asReadonly();
  readonly viewMode = this._viewMode.asReadonly();
  readonly sort = this._sort.asReadonly();
  readonly stats = this._stats.asReadonly();

  // --- Tubería reactiva para búsqueda con Debounce + SwitchMap ---
  private readonly searchSubject$ = new Subject<string>();

  // --- Manejo de Spam-Click: Acumulador de deltas por ID de item ---
  private readonly progressTrigger$ = new Subject<{ id: string; delta: number }>();
  private readonly pendingDeltas = new Map<string, number>();

  constructor() {
    this.setupDebouncedProgress();
    this.setupDebouncedSearch();
  }

  /**
   * Carga la lista de items desde la API aplicando los filtros vigentes en el backend.
   */
  loadItems(filters?: ItemFilters): void {
    this._loading.set(true);
    this._error.set(null);

    let params = new HttpParams();
    const status = filters?.status ?? this._activeStatus();
    const q = filters?.q ?? this._searchQuery().trim();
    const sort = filters?.sort ?? this._sort();

    if (status && status !== 'todos') params = params.set('status', status);
    if (filters?.type) params = params.set('type', filters.type);
    if (q) params = params.set('q', q);
    if (sort) params = params.set('sort', sort);
    if (filters?.order) params = params.set('order', filters.order);

    this.http.get<MediaItem[]>(this.apiUrl, { params }).subscribe({
      next: (items) => {
        this._items.set(items);
        this._loading.set(false);
      },
      error: (err) => {
        this._error.set(err.message || 'Error al cargar los ítems');
        this._loading.set(false);
      },
    });

    // En paralelo, mantenemos sincronizadas las estadísticas globales
    this.loadStats();
  }

  /**
   * Consulta el endpoint /stats del Worker para alimentar los badges de la FilterBar.
   */
  loadStats(): void {
    this.http.get<ItemStats>(`${this.apiUrl}/stats`).subscribe({
      next: (stats) => this._stats.set(stats),
      error: (err) => console.error('Error al cargar estadísticas:', err),
    });
  }

  /**
   * Incremento rápido de progreso (+1 capítulo) con respuesta inmediata (optimista)
   * y acumulación mediante Debounce para evitar sobrecarga de red y condiciones de carrera.
   */
  incrementProgress(id: string, delta = 1): void {
    const currentItems = this._items();
    const targetItem = currentItems.find((item) => item.id === id);

    if (!targetItem) return; // Si no existe el item, no hacemos nada

    // Respetar el límite si existe total_chapters
    if (
      targetItem.total_chapters &&
      targetItem.current_chapter + delta > targetItem.total_chapters
    ) {
      return;
    }

    // 1. REACCIÓN INSTANTÁNEA EN UI (0 ms): Mutación optimista en el Signal
    this._items.update((items) =>
      items.map((item) =>
        item.id === id ? { ...item, current_chapter: item.current_chapter + delta } : item,
      ),
    );

    // 2. Acumular el delta pendiente y emitir al Subject de debounce
    const currentAccumulated = this.pendingDeltas.get(id) ?? 0;
    this.pendingDeltas.set(id, currentAccumulated + delta);

    // Emitimos al Subject para reiniciar la ventana de debounce
    this.progressTrigger$.next({ id, delta });
  }

  /**
   * Configura la tubería de Debounce con RxJS:
   * Espera 400ms tras el último click para enviar un único request consolidado a la DB.
   *
   * TODO (Post-MVP): Evaluar migrar este enfoque de Map + Trigger global a un pipeline
   * reactivo puro con `groupBy(event => event.id)` + `scan()` + `debounceTime(400)`.
   * Enfoque actual: simple y suficiente para single-user (un solo usuario clickeando).
   */
  private setupDebouncedProgress(): void {
    this.progressTrigger$
      .pipe(
        debounceTime(400), // Espera 400ms de calma tras el último click del usuario
      )
      .subscribe(() => {
        // Disparamos una petición por cada ítem que tenga deltas acumulados
        for (const [id, totalDelta] of this.pendingDeltas.entries()) {
          if (totalDelta <= 0) continue;

          // Limpiamos el acumulador antes de enviar para evitar duplicaciones
          this.pendingDeltas.delete(id);

          this.http
            .post<MediaItem>(`${this.apiUrl}/${id}/progress`, {
              mode: 'delta',
              delta: totalDelta,
            })
            .subscribe({
              next: (updatedItem) => {
                // Sincronizamos con el estado final de la base de datos
                this._items.update((items) =>
                  items.map((item) => (item.id === id ? updatedItem : item)),
                );
                this.loadStats();
              },
              error: (err) => {
                // En caso de fallo de red, recargamos la lista limpia desde el backend
                this._error.set(err.message || 'No se pudo sincronizar el progreso');
                this.loadItems();
              },
            });
        }
      });
  }

  /**
   * Configura la tubería reactiva para la búsqueda en el backend con Debounce.
   * Evita condiciones de carrera y no satura a Cloudflare con peticiones por cada tecla.
   */
  private setupDebouncedSearch(): void {
    this.searchSubject$
      .pipe(
        debounceTime(300),
        distinctUntilChanged(),
      )
      .subscribe(() => {
        this.loadItems();
      });
  }

  setActiveStatus(status: ItemStatus | 'todos'): void {
    this._activeStatus.set(status);
    this.loadItems();
  }

  setSearchQuery(query: string): void {
    this._searchQuery.set(query);
    this.searchSubject$.next(query);
  }

  setViewMode(mode: 'grid' | 'list'): void {
    this._viewMode.set(mode);
  }

  setSort(sort: string): void {
    this._sort.set(sort);
    this.loadItems();
  }
}
