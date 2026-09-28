import { ChangeDetectionStrategy, Component, inject, OnInit } from '@angular/core';
import { ItemService } from '../services/item.service';
import { ItemCardComponent } from '../components/item-card/item-card.component';
import { ItemStatus, MediaItem } from '../models/item.model';
import { FilterBarComponent } from '../components/filter-bar/filter-bar.component';

@Component({
  selector: 'app-home',
  imports: [ItemCardComponent, FilterBarComponent],
  templateUrl: './home.component.html',
  styleUrl: './home.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HomeComponent implements OnInit {
  private readonly itemService = inject(ItemService);

  // Señales de solo lectura expuestas directamente desde el servicio
  protected readonly items = this.itemService.items;
  protected readonly loading = this.itemService.loading;
  protected readonly error = this.itemService.error;
  protected readonly activeStatus = this.itemService.activeStatus;
  protected readonly searchQuery = this.itemService.searchQuery;
  protected readonly viewMode = this.itemService.viewMode;
  protected readonly stats = this.itemService.stats;

  ngOnInit(): void {
    // Al arrancar, intentamos cargar los ítems reales desde /api/items
    this.itemService.loadItems();
  }

  protected onIncrement(id: string): void {
    this.itemService.incrementProgress(id);
  }

  protected onRetry(): void {
    this.itemService.loadItems();
  }

  /**
   * Helper temporal para previsualizar una tarjeta en vivo
   * si la base de datos aún no tiene registros.
   */
  protected addSampleItem(): void {
    const sample: MediaItem = {
      id: 'sample-01',
      title: 'Solo Leveling',
      type: 'manhwa',
      status: 'en_curso',
      cover_url:
        'https://s4.anilist.co/file/anilistcdn/media/manga/cover/large/bx105398-b673NoT5mB9v.jpg',
      synopsis: 'Sung Jinwoo sube de nivel en un mundo de mazmorras.',
      current_chapter: 110,
      total_chapters: 200,
      score: 9,
      notes: null,
      source_url: null,
      external_id: '105398',
      external_source: 'anilist',
      started_at: '2026-01-10',
      finished_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    (this.itemService as any)._items.update((list: MediaItem[]) => [sample, ...list]);
  }

  protected onStatusChange(status: ItemStatus | 'todos'): void {
    this.itemService.setActiveStatus(status);
  }

  protected onSearchChange(query: string): void {
    this.itemService.setSearchQuery(query);
  }

  protected onViewModeChange(mode: 'grid' | 'list'): void {
    this.itemService.setViewMode(mode);
  }

  protected onSortChange(sort: string): void {
    this.itemService.setSort(sort);
  }
  protected onSearchQueryChange(query: string): void {
    this.itemService.setSearchQuery(query);
  }
}
