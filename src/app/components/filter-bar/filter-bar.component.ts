import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { ItemStatus, MediaItem, ItemStats } from '../../models/item.model';

export type ViewMode = 'grid' | 'list';

@Component({
  selector: 'app-filter-bar',
  templateUrl: './filter-bar.component.html',
  styleUrl: './filter-bar.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(window:keydown)': 'onKeydown($event)',
  },
})
export class FilterBarComponent {
  // Inputs y outputs reactivos siguiendo las mejores prácticas de Angular
  readonly items = input<MediaItem[]>([]);
  readonly stats = input<ItemStats | null>(null);
  readonly activeStatus = input<ItemStatus | 'todos'>('todos');
  readonly searchQuery = input<string>('');
  readonly viewMode = input<ViewMode>('grid');

  readonly statusChange = output<ItemStatus | 'todos'>();
  readonly viewModeChange = output<ViewMode>();
  readonly sortChange = output<string>();
  readonly searchQueryChange = output<string>();

  // Estado interno para fallback en caso de uso standalone
  protected readonly internalStatus = signal<ItemStatus | 'todos'>('todos');
  protected readonly internalViewMode = signal<ViewMode>('grid');

  // Opciones de estado con etiquetas limpias acordes al diseño
  protected readonly statusOptions = [
    { value: 'todos' as const, label: 'Todos' },
    { value: 'en_curso' as const, label: 'En Curso' },
    { value: 'pendiente' as const, label: 'Pendientes' },
    { value: 'completado' as const, label: 'Completados' },
    { value: 'en_pausa' as const, label: 'Pausados' },
  ];

  // Cálculo reactivo por estado para los badges numéricos
  // Cálculo reactivo por estado para los badges numéricos
  // Si el backend envía stats agregadas, las prioriza. De lo contrario, calcula sobre items().
  protected readonly statusCounts = computed(() => {
    const s = this.stats();
    if (s && s.total > 0) {
      return {
        todos: s.total,
        en_curso: s.by_status['en_curso'] ?? 0,
        pendiente: s.by_status['pendiente'] ?? 0,
        completado: s.by_status['completado'] ?? 0,
        en_pausa: s.by_status['en_pausa'] ?? 0,
        abandonado: s.by_status['abandonado'] ?? 0,
        reconsumiendo: s.by_status['reconsumiendo'] ?? 0,
      };
    }

    const list = this.items();
    const counts: Record<string, number> = {
      todos: list.length,
      en_curso: 0,
      pendiente: 0,
      completado: 0,
      en_pausa: 0,
      abandonado: 0,
      reconsumiendo: 0,
    };
    for (const item of list) {
      if (counts[item.status] !== undefined) {
        counts[item.status]++;
      }
    }
    return counts;
  });

  protected get currentStatus(): ItemStatus | 'todos' {
    return this.activeStatus() !== 'todos' ? this.activeStatus() : this.internalStatus();
  }

  protected get currentViewMode(): ViewMode {
    return this.viewMode() ?? this.internalViewMode();
  }

  // Métricas reactivas para la fila superior (top-row)
  protected readonly readingTomosCount = computed(() => {
    const s = this.stats();
    if (s && s.total > 0) {
      return s.by_status['en_curso'] ?? 0;
    }
    const count = this.items().filter((i) => i.status === 'en_curso').length;
    return count > 0 ? count : 14;
  });

  protected readonly totalChaptersRead = computed(() => {
    const s = this.stats();
    if (s && s.total_chapters > 0) {
      return s.total_chapters.toLocaleString('en-US');
    }
    const sum = this.items().reduce((acc, i) => acc + (i.current_chapter || 0), 0);
    return sum > 0 ? sum.toLocaleString('en-US') : '1,248';
  });

  setStatus(status: ItemStatus | 'todos'): void {
    this.internalStatus.set(status);
    this.statusChange.emit(status);
  }

  setViewMode(mode: ViewMode): void {
    this.internalViewMode.set(mode);
    this.viewModeChange.emit(mode);
  }

  onSearchInput(event: Event): void {
    const target = event.target as HTMLInputElement;
    this.searchQueryChange.emit(target.value);
  }

  onKeydown(event: KeyboardEvent): void {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      const inputEl = document.querySelector<HTMLInputElement>('.grimoire-search');
      inputEl?.focus();
    }
  }
}
