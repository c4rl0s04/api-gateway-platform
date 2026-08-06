const deploymentRegionLabels: Record<string, string> = {
  be: 'Belgium',
  br: 'Brazil',
  ce: 'Central Europe',
  de: 'Germany',
  es: 'Spain',
  fr: 'France',
  jp: 'Japan',
  kr: 'South Korea',
  uk: 'United Kingdom',
  us: 'United States',
};

export function deploymentRegionLabel(region: string): string {
  return deploymentRegionLabels[region.toLowerCase()]
    ?? region.toUpperCase();
}

export function deploymentRegionCode(region: string): string {
  return region.toUpperCase();
}

export function sortDeploymentRegions(regions: Iterable<string>): string[] {
  return [...new Set([...regions].map(region => region.toLowerCase()))]
    .sort((left, right) => deploymentRegionLabel(left)
      .localeCompare(deploymentRegionLabel(right)));
}
