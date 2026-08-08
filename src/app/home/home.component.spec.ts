import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HomeComponent } from './home.component';
import axe from 'axe-core';

describe('HomeComponent', () => {
  let fixture: ComponentFixture<HomeComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [HomeComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(HomeComponent);
    fixture.detectChanges();
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('should display the app title visually hidden', () => {
    const element: HTMLElement = fixture.nativeElement;
    const h1 = element.querySelector('h1');
    expect(h1).toBeTruthy();
    expect(h1?.textContent).toContain('Tsuzuki');
    // Verify sr-only class makes it visually hidden but accessible
    expect(h1?.classList.contains('sr-only')).toBe(true);
  });

  it('should display placeholder status text', () => {
    const element: HTMLElement = fixture.nativeElement;
    expect(element.textContent).toContain('En curso');
    expect(element.textContent).toContain('coming soon');
  });

  it('should use semantic main landmark', () => {
    const element: HTMLElement = fixture.nativeElement;
    const main = element.querySelector('main');
    expect(main).toBeTruthy();
  });

  it('should pass AXE accessibility audit (zero violations)', async () => {
    const element: HTMLElement = fixture.nativeElement;
    const results = await axe.run(element);
    expect(results.violations.length).toBe(0);
  });
});
