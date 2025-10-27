describe('Jest Setup', () => {
  it('should run a basic test', () => {
    expect(1 + 1).toBe(2);
  });

  it('should handle string operations', () => {
    const greeting = 'Hello, Jest!';
    expect(greeting).toContain('Jest');
  });
});
