import { TestBed } from '@angular/core/testing';
import { App } from './app';

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it('should have title Tsuzuki', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    // Access the signal value — after Phase 4, title signal should be 'Tsuzuki'
    expect(app['title']()).toBe('Tsuzuki');
  });
});
