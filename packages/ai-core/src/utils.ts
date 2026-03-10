let counter = 0;

export const generateId = (): string => {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).slice(2, 8);
  counter = (counter + 1) % 1000;
  return `${timestamp}-${random}-${counter.toString(36)}`;
};

export const now = (): number => Date.now();
