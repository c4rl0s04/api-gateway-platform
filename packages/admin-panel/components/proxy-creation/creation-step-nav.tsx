interface CreationStepNavProps {
  currentStep: number;
  highestStep: number;
  onSelect: (step: number) => void;
}

const steps = ['Identity', 'API definition', 'Routing & policies', 'Review'];

export function CreationStepNav({
  currentStep,
  highestStep,
  onSelect,
}: CreationStepNavProps) {
  return (
    <nav className="creation-step-nav" aria-label="Proxy creation progress">
      <ol>
        {steps.map((label, index) => {
          const available = index <= highestStep;
          const current = index === currentStep;
          return (
            <li className={current ? 'is-current' : index < currentStep ? 'is-complete' : ''} key={label}>
              <button
                type="button"
                disabled={!available}
                aria-current={current ? 'step' : undefined}
                onClick={() => onSelect(index)}
              >
                <span>{index + 1}</span>
                <strong>{label}</strong>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
