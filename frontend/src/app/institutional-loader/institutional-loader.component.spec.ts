import { ComponentFixture, TestBed } from '@angular/core/testing';
import { InstitutionalLoaderComponent } from './institutional-loader.component';

describe('InstitutionalLoaderComponent', () => {
  let fixture: ComponentFixture<InstitutionalLoaderComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [InstitutionalLoaderComponent]
    }).compileComponents();

    fixture = TestBed.createComponent(InstitutionalLoaderComponent);
  });

  it('renders the overlay and dynamic message only while visible', () => {
    fixture.componentInstance.visible = false;
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.loader-overlay')).toBeNull();

    fixture.componentInstance.visible = true;
    fixture.componentInstance.message = 'Cargando documento...';
    fixture.detectChanges();

    const overlay = fixture.nativeElement.querySelector('.loader-overlay');
    expect(overlay).not.toBeNull();
    expect(overlay.textContent).toContain('Cargando documento...');
    expect(overlay.querySelector('.globe')).not.toBeNull();
    expect(overlay.querySelector('.airplane')).not.toBeNull();
  });
});
