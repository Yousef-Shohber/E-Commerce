export function rowsOf<T = any>(result: unknown): T[] {
  if (
    Array.isArray(result) &&
    result.length === 2 &&
    Array.isArray(result[0]) &&
    typeof result[1] === 'number'
  ) {
    return result[0] as T[];
  }
  return result as T[];
}

/**
    'SELECT * FROM products' returns ==> 
    [
      { id: 1, name: 'Laptop' },
    ]

    'UPDATE products SET stock = stock - 1 WHERE id = $1 RETURNING *'  returns ==>
    [
      [
        { id: 1, name: 'Laptop', stock: 9 }
      ],
      1
    ]
 */
